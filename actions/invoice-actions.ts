"use server";
/**
 * Invoice Server Actions — IDOR-safe, business-logic hardened
 *
 * Security guarantees:
 *  1. Every mutating query includes AND branchId = ctx.session.branchId (IDOR).
 *  2. Input validated by Zod via createSafeAction/createAuthorizedAction before any DB call.
 *  3. branchId NEVER comes from client input — always from the server-side session.
 *  4. unitPrice is looked up server-side from products table — client value ignored.
 *  5. customerId is verified to belong to the caller's branch before insert.
 *  6. Invoice status transitions enforced: paid invoices cannot regress or be cancelled.
 *  7. Explicit column selection on all reads (no data over-fetching).
 *  8. Business-logic errors use ActionError so they surface to the client;
 *     DB/internal errors are sanitized to a generic message by the wrapper.
 */
import { db } from "@/db";
import { invoices, invoiceItems, products, customers } from "@/db/schema";
import { createSafeAction, createAuthorizedAction, ActionError } from "@/lib/safe-action";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

// ─── Constants ──────────────────────────────────────────────────────────────────

/**
 * INVOICE_STATUS_TRANSITIONS defines the valid forward-only state machine.
 * A 'paid' invoice cannot be moved back to 'draft' or 'sent'.
 * A 'cancelled' invoice cannot be reactivated.
 */
const INVOICE_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["sent", "cancelled"],
  sent: ["paid", "cancelled"],
  paid: [],        // terminal — no transitions allowed
  cancelled: [],   // terminal — no transitions allowed
};

// ─── Schemas ──────────────────────────────────────────────────────────────────

const GetInvoiceSchema = z.object({
  id: z.string().min(1),
});

const CreateInvoiceSchema = z.object({
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
    .max(100), // guard against oversized payloads
  notes: z.string().max(500).optional(),
});

const UpdateInvoiceSchema = z.object({
  id: z.string().min(1),
  notes: z.string().max(500).optional(),
  status: z.enum(["draft", "sent", "paid", "cancelled"]).optional(),
});

const DeleteInvoiceSchema = z.object({
  id: z.string().min(1),
});

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * getInvoice
 * Scope select to caller's branchId + explicit column list (no over-fetching).
 */
export const getInvoice = createSafeAction(
  GetInvoiceSchema,
  async ({ id }, ctx) => {
    const invoice = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        customerId: invoices.customerId,
        status: invoices.status,
        totalAmount: invoices.totalAmount,
        createdAt: invoices.createdAt,
        dueDate: invoices.dueDate,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.id, id),
          // IDOR fix: branchId from session only
          eq(invoices.branchId, ctx.session.branchId)
        )
      )
      .limit(1);

    if (!invoice[0]) {
      throw new ActionError("Invoice not found");
    }

    return invoice[0];
  }
);

/**
 * createInvoice
 *
 * SECURITY FIX — Server-side price lookup:
 *   The client submits productId + quantity ONLY.
 *   unitPrice is fetched from the DB (products.sellingPrice) and validated
 *   against the caller's branchId before being used to compute totalAmount.
 *   This prevents a client from submitting a manipulated price (e.g. $0.01
 *   for a product that costs $100).
 *
 * SECURITY FIX — customerId validation:
 *   customerId is verified to belong to the caller's branch before insert.
 *   This prevents referencing a customer record from another tenant.
 */
export const createInvoice = createSafeAction(
  CreateInvoiceSchema,
  async ({ customerId, items, notes }, ctx) => {
    return await db.transaction(async (tx) => {
      // 1. Validate customerId belongs to this branch
      const customer = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(
          and(
            eq(customers.id, customerId),
            eq(customers.branchId, ctx.session.branchId)
          )
        )
        .limit(1);

      if (!customer[0]) {
        throw new ActionError("Customer not found");
      }

      // 2. Fetch authoritative prices from DB for all requested products
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

      // Build a lookup map for O(1) access
      const priceMap = new Map(priceRows.map((p) => [p.id, p.sellingPrice]));

      // 3. Validate every requested product has a price record
      for (const item of items) {
        if (!priceMap.has(item.productId)) {
          throw new ActionError(
            `Product not found or unavailable: ${item.productId}`
          );
        }
      }

      // 4. Compute totalAmount from server-side prices — client unitPrice is never used
      const resolvedItems = items.map((item) => ({
        ...item,
        unitPrice: priceMap.get(item.productId)!,
      }));

      const totalAmount = resolvedItems.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice,
        0
      );

      // 5. Insert invoice header
      const invoiceId = crypto.randomUUID();
      await tx.insert(invoices).values({
        id: invoiceId,
        // branchId from session — client cannot override this
        branchId: ctx.session.branchId,
        customerId,
        totalAmount,
        notes,
        status: "draft",
        createdAt: new Date(),
      });

      // 6. Insert line items using server-resolved prices
      await tx.insert(invoiceItems).values(
        resolvedItems.map((item) => ({
          id: crypto.randomUUID(),
          invoiceId,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice, // server-side price
        }))
      );

      return { id: invoiceId, totalAmount };
    });
  }
);

/**
 * updateInvoice
 *
 * SECURITY FIX — State machine enforcement:
 *   Checks the current status before applying a status change.
 *   Prevents invalid transitions like paid → draft, cancelled → sent.
 *   Uses INVOICE_STATUS_TRANSITIONS for the allowed-moves table.
 */
export const updateInvoice = createAuthorizedAction(
  UpdateInvoiceSchema,
  ["admin", "manager"],
  async ({ id, notes, status }, ctx) => {
    // If requesting a status change, validate the transition first
    if (status !== undefined) {
      const current = await db
        .select({ status: invoices.status })
        .from(invoices)
        .where(
          and(
            eq(invoices.id, id),
            eq(invoices.branchId, ctx.session.branchId)
          )
        )
        .limit(1);

      if (!current[0]) {
        throw new ActionError("Invoice not found or access denied");
      }

      const currentStatus = current[0].status;
      const allowedNext = INVOICE_STATUS_TRANSITIONS[currentStatus] ?? [];

      if (!allowedNext.includes(status)) {
        throw new ActionError(
          `Invalid status transition: ${currentStatus} → ${status}`
        );
      }
    }

    const result = await db
      .update(invoices)
      .set({
        ...(notes !== undefined && { notes }),
        ...(status !== undefined && { status }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(invoices.id, id),
          // IDOR fix: cross-branch mutation is impossible
          eq(invoices.branchId, ctx.session.branchId)
        )
      )
      .returning({ id: invoices.id });

    if (result.length === 0) {
      throw new ActionError("Invoice not found or access denied");
    }

    return { id: result[0].id };
  }
);

/**
 * deleteInvoice
 *
 * SECURITY FIX — Paid invoice guard:
 *   A 'paid' invoice cannot be soft-deleted/cancelled — it is a financial record.
 *   The current status is fetched and checked before applying the cancellation.
 */
export const deleteInvoice = createAuthorizedAction(
  DeleteInvoiceSchema,
  ["admin"],
  async ({ id }, ctx) => {
    // Fetch current status to enforce the guard
    const current = await db
      .select({ status: invoices.status })
      .from(invoices)
      .where(
        and(
          eq(invoices.id, id),
          eq(invoices.branchId, ctx.session.branchId)
        )
      )
      .limit(1);

    if (!current[0]) {
      throw new ActionError("Invoice not found or access denied");
    }

    if (current[0].status === "paid") {
      throw new ActionError(
        "Cannot cancel a paid invoice. Raise a credit note instead."
      );
    }

    if (current[0].status === "cancelled") {
      throw new ActionError("Invoice is already cancelled.");
    }

    // Soft-delete: set status = 'cancelled' rather than physical DELETE
    // Preserves audit trail.
    const result = await db
      .update(invoices)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(invoices.id, id),
          // IDOR fix: branchId must match session — no cross-tenant deletion
          eq(invoices.branchId, ctx.session.branchId)
        )
      )
      .returning({ id: invoices.id });

    if (result.length === 0) {
      throw new ActionError("Invoice not found or access denied");
    }

    return { deleted: true, id: result[0].id };
  }
);
