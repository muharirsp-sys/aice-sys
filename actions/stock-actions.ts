"use server";
/**
 * Stock / Sales Server Actions — Race-condition-safe, business-logic hardened
 *
 * Security guarantees:
 *  1. Stock deduction uses RELATIVE update (quantity - input) inside db.transaction().
 *     → Eliminates read-then-write TOCTOU race condition / double-spend.
 *  2. A conditional guard is enforced at query level: WHERE stock >= input.
 *     → If stock is insufficient, 0 rows update → transaction rolls back.
 *  3. All mutations scoped to branchId from session (IDOR protection).
 *  4. unitPrice for sales is fetched from products table — client value ignored.
 *  5. delta=0 is rejected early (prevents no-op UPDATE hitting the DB).
 *  6. Explicit column selection on queries (no data over-fetching).
 *  7. Business-logic errors use ActionError for client visibility;
 *     DB/internal errors are sanitized to 'Request failed' by the wrapper.
 */
import { db } from "@/db";
import { products, salesOrders, salesOrderItems } from "@/db/schema";
import { createSafeAction, createAuthorizedAction, ActionError } from "@/lib/safe-action";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateSaleSchema = z.object({
  customerId: z.string().min(1),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        // quantity only — unitPrice is NOT accepted from client (looked up server-side)
        quantity: z.number().int().positive(),
      })
    )
    .min(1)
    .max(100), // guard against oversized payloads / DoS
});

const AdjustStockSchema = z.object({
  productId: z.string().min(1),
  // delta=0 is rejected at schema level — it is a no-op and should not reach the DB
  delta: z.number().int().refine((n) => n !== 0, { message: "delta must be non-zero" }),
  reason: z.enum(["purchase", "adjustment", "return", "damage"]),
});

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * createSale
 *
 * RACE-CONDITION FIX:
 *   ❌ VULNERABLE pattern (read-then-write — DO NOT USE):
 *       const product = await db.select().where(id)
 *       if (product.stock < qty) throw Error
 *       await db.update(products).set({ stock: product.stock - qty })
 *       // Two concurrent requests both pass the check before either deducts!
 *
 *   ✅ SAFE pattern (conditional relative update — used below):
 *       await db.update(products)
 *         .set({ stock: sql`stock - qty` })
 *         .where(and(eq(id), gte(stock, qty)))
 *       // Atomic at DB level. 0 rows updated = insufficient stock → rollback.
 *
 * PRICE FIX:
 *   Client submits productId + quantity only.
 *   sellingPrice is fetched from the products table (server-side authoritative source).
 */
export const createSale = createSafeAction(
  CreateSaleSchema,
  async ({ customerId, items }, ctx) => {
    return await db.transaction(async (tx) => {
      // 1. Fetch authoritative prices for all requested products in one query
      const productIds = items.map((i) => i.productId);
      const priceRows = await tx
        .select({
          id: products.id,
          sellingPrice: products.sellingPrice,
        })
        .from(products)
        .where(
          and(
            inArray(products.id, productIds),
            // IDOR: products must belong to caller's branch
            eq(products.branchId, ctx.session.branchId)
          )
        );

      const priceMap = new Map(priceRows.map((p) => [p.id, p.sellingPrice]));

      // 2. Validate all products exist in this branch before touching stock
      for (const item of items) {
        if (!priceMap.has(item.productId)) {
          throw new ActionError(
            `Product not found or unavailable: ${item.productId}`
          );
        }
      }

      // 3. Resolve items with server-side prices
      const resolvedItems = items.map((item) => ({
        ...item,
        unitPrice: priceMap.get(item.productId)!,
      }));

      const totalAmount = resolvedItems.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice,
        0
      );

      // 4. Create the order header
      const orderId = crypto.randomUUID();
      await tx.insert(salesOrders).values({
        id: orderId,
        // branchId from session only
        branchId: ctx.session.branchId,
        customerId,
        totalAmount,
        status: "pending",
        createdBy: ctx.session.user.id,
        createdAt: new Date(),
      });

      // 5. Atomically deduct stock for each line item
      for (const item of resolvedItems) {
        // ATOMIC relative deduction — no read-then-write
        // WHERE includes gte(stock, quantity) → insufficient stock = 0 rows → throw → rollback
        const deducted = await tx
          .update(products)
          .set({
            stock: sql`${products.stock} - ${item.quantity}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(products.id, item.productId),
              // IDOR: product must belong to caller's branch
              eq(products.branchId, ctx.session.branchId),
              // Race-condition guard: only deduct if stock is sufficient RIGHT NOW
              gte(products.stock, item.quantity)
            )
          )
          .returning({ id: products.id });
          // NOTE: newStock intentionally not returned — post-update value not needed here

        if (deducted.length === 0) {
          throw new ActionError(
            `Insufficient stock for product: ${item.productId}`
          );
        }
      }

      // 6. Insert line items with server-resolved prices
      await tx.insert(salesOrderItems).values(
        resolvedItems.map((item) => ({
          id: crypto.randomUUID(),
          orderId,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice, // server-side price
        }))
      );

      return { orderId, totalAmount };
    });
  }
);

/**
 * adjustStock
 * For manual stock adjustments (purchase received, damage write-off, etc.)
 * Restricted to admin/manager only.
 *
 * delta must be non-zero (validated in schema).
 * For negative delta (removal), atomic check prevents going below zero.
 */
export const adjustStock = createAuthorizedAction(
  AdjustStockSchema,
  ["admin", "manager"],
  async ({ productId, delta, reason }, ctx) => {
    // delta !== 0 is guaranteed by Zod schema refine above
    await db.transaction(async (tx) => {
      if (delta < 0) {
        const removingQty = Math.abs(delta);
        const updateResult = await tx
          .update(products)
          .set({
            stock: sql`${products.stock} - ${removingQty}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(products.id, productId),
              eq(products.branchId, ctx.session.branchId),
              // Prevent negative stock atomically
              gte(products.stock, removingQty)
            )
          )
          .returning({ id: products.id });

        if (updateResult.length === 0) {
          throw new ActionError("Insufficient stock or product not found");
        }
      } else {
        // delta > 0 (adding stock)
        const updateResult = await tx
          .update(products)
          .set({
            stock: sql`${products.stock} + ${delta}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(products.id, productId),
              eq(products.branchId, ctx.session.branchId)
            )
          )
          .returning({ id: products.id });

        if (updateResult.length === 0) {
          throw new ActionError("Product not found or access denied");
        }
      }

      // TODO: insert into stock_audit_log for traceability
      // await tx.insert(stockAuditLog).values({
      //   productId, delta, reason, userId: ctx.session.user.id, createdAt: new Date()
      // })
    });

    return { adjusted: true, productId, delta, reason };
  }
);

/**
 * getProductStock
 * Returns ONLY stock-relevant columns — no costPrice, supplierMargin, etc.
 */
export const getProductStock = createSafeAction(
  z.object({ productId: z.string().min(1) }),
  async ({ productId }, ctx) => {
    const product = await db
      .select({
        // Explicit columns — costPrice and supplierMargin intentionally excluded
        id: products.id,
        name: products.name,
        sku: products.sku,
        stock: products.stock,
        unit: products.unit,
        reorderPoint: products.reorderPoint,
      })
      .from(products)
      .where(
        and(
          eq(products.id, productId),
          eq(products.branchId, ctx.session.branchId)
        )
      )
      .limit(1);

    if (!product[0]) throw new ActionError("Product not found");
    return product[0];
  }
);
