/**
 * Data Access Layer — Column-scoped, auth-enforced query helpers
 *
 * PURPOSE:
 *   Prevent data over-fetching (CWE-213) by centralizing all DB reads into
 *   named projection sets. Components import these helpers instead of writing
 *   raw Drizzle queries, ensuring sensitive columns are never accidentally
 *   included in RSC/client payloads.
 *
 * AUTH ENFORCEMENT:
 *   All query helpers accept ActionContext (from safe-action) instead of a
 *   raw branchId string. This means:
 *   - They can ONLY be called from within a createSafeAction/createAuthorizedAction
 *     handler that has already verified the session.
 *   - A caller cannot fabricate a branchId — it always comes from the
 *     server-verified session (ctx.session.branchId).
 *   - Calling these helpers outside of a verified action context requires
 *     explicitly constructing an ActionContext, making accidental misuse obvious.
 *
 * COLUMNS NEVER RETURNED TO CLIENT:
 *   - products.costPrice          (supplier margin)
 *   - products.supplierMargin     (business-sensitive)
 *   - users.passwordHash          (auth credential)
 *   - users.totpSecret            (auth credential)
 *   - invoices.internalNotes      (internal operations — detail view only)
 *   - customers.creditRiskScore   (internal risk data)
 */
import { db } from "@/db";
import { products, invoices, customers, users } from "@/db/schema";
import type { ActionContext } from "@/lib/safe-action";
import { and, eq, desc, like } from "drizzle-orm";

// ─── Product Projections ──────────────────────────────────────────────────────

/** Public-facing product card (catalog, POS) */
export const ProductPublicFields = {
  id: products.id,
  name: products.name,
  sku: products.sku,
  category: products.category,
  unit: products.unit,
  sellingPrice: products.sellingPrice,
  imageUrl: products.imageUrl,
} as const;

/**
 * Internal product fields (stock management, purchasing).
 * Only use in authorized action handlers — NOT in RSC/client components.
 */
export const ProductInternalFields = {
  ...ProductPublicFields,
  stock: products.stock,
  reorderPoint: products.reorderPoint,
  costPrice: products.costPrice,          // only for authorized internal views
  supplierMargin: products.supplierMargin,
} as const;

/** Stock-only view (sales reps — no price margin info) */
export const ProductStockFields = {
  id: products.id,
  name: products.name,
  sku: products.sku,
  stock: products.stock,
  unit: products.unit,
  reorderPoint: products.reorderPoint,
} as const;

// ─── Invoice Projections ──────────────────────────────────────────────────────

/** Invoice list view — no internal notes */
export const InvoiceListFields = {
  id: invoices.id,
  invoiceNumber: invoices.invoiceNumber,
  customerId: invoices.customerId,
  status: invoices.status,
  totalAmount: invoices.totalAmount,
  dueDate: invoices.dueDate,
  createdAt: invoices.createdAt,
} as const;

/** Invoice detail view — includes notes for managers */
export const InvoiceDetailFields = {
  ...InvoiceListFields,
  internalNotes: invoices.internalNotes,  // only included in detail view, authorized callers
} as const;

// ─── User Projections ─────────────────────────────────────────────────────────

/** Safe user profile — never include auth credentials */
export const UserSafeFields = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  branchId: users.branchId,
  createdAt: users.createdAt,
  // NEVER include: passwordHash, totpSecret, emailVerificationToken
} as const;

// ─── Query Helpers ────────────────────────────────────────────────────────────
//
// AUTH CONTRACT: All helpers below accept ActionContext, not raw branchId.
// This makes it structurally impossible to call them without a verified session.
// The branchId is always derived from ctx.session.branchId — never from caller input.

/**
 * getProductsForBranch
 * Returns public catalog fields only — safe for RSC/client.
 *
 * NOTE on search: uses a trailing-only wildcard (name LIKE 'term%') for
 * prefix search. A leading wildcard (`%term%`) cannot use a B-tree index;
 * use full-text search (FTS5) for arbitrary substring matching at scale.
 */
export async function getProductsForBranch(
  ctx: ActionContext,
  search?: string
) {
  return db
    .select(ProductPublicFields)
    .from(products)
    .where(
      and(
        eq(products.branchId, ctx.session.branchId),
        // Trailing wildcard only — allows index scan on (branchId, name)
        search ? like(products.name, `${search}%`) : undefined
      )
    )
    .orderBy(desc(products.updatedAt));
}

/**
 * getInvoicesForBranch
 * List view — no internalNotes in payload.
 */
export async function getInvoicesForBranch(
  ctx: ActionContext,
  options?: { limit?: number; offset?: number }
) {
  const limit = Math.min(options?.limit ?? 50, 200); // cap at 200 to prevent large reads
  return db
    .select(InvoiceListFields)
    .from(invoices)
    .where(eq(invoices.branchId, ctx.session.branchId))
    .orderBy(desc(invoices.createdAt))
    .limit(limit)
    .offset(options?.offset ?? 0);
}

/**
 * getInvoiceDetail
 * Includes internalNotes — call only from authorized action handlers.
 * branchId scoping (IDOR protection) is enforced via ctx.
 */
export async function getInvoiceDetail(
  id: string,
  ctx: ActionContext
) {
  const rows = await db
    .select(InvoiceDetailFields)
    .from(invoices)
    .where(
      and(
        eq(invoices.id, id),
        eq(invoices.branchId, ctx.session.branchId)
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

/**
 * getCustomersForBranch
 * Never returns creditRiskScore to RSC/client layer.
 */
export async function getCustomersForBranch(ctx: ActionContext) {
  return db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      address: customers.address,
      // creditRiskScore intentionally omitted
    })
    .from(customers)
    .where(eq(customers.branchId, ctx.session.branchId))
    .orderBy(customers.name);
}
