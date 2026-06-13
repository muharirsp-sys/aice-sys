/**
 * Safe Server Action Wrapper
 * Combines: Better Auth session check → RBAC role guard → Zod validation
 * Usage:
 *   const action = createSafeAction(schema, async (data, ctx) => { ... })
 *   const authorizedAction = createAuthorizedAction(schema, ['admin','manager'], async (data, ctx) => { ... })
 */
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { z, ZodSchema } from "zod";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActionContext = {
  session: {
    user: {
      id: string;
      email: string;
      role: string;
    };
    branchId: string;
  };
};

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export type SafeAction<TInput, TOutput> = (
  input: TInput
) => Promise<ActionResult<TOutput>>;

// ─── Internal Error Sanitizer ────────────────────────────────────────────────────

/**
 * SECURITY: Raw DB/internal error messages MUST NOT reach the client.
 * They can leak table names, column names, constraint names, or SQL fragments.
 *
 * Only errors thrown with this sentinel class are forwarded verbatim.
 * Everything else becomes a generic "Request failed" message.
 */
export class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionError";
  }
}

function sanitizeError(err: unknown): string {
  if (err instanceof ActionError) {
    // Explicitly thrown business-logic errors — safe to surface
    return err.message;
  }
  // Log full error server-side, return opaque message to client
  console.error("[safe-action] internal error:", err);
  return "Request failed";
}

// ─── Core Wrapper ─────────────────────────────────────────────────────────────

/**
 * createSafeAction
 * Validates input with Zod and enforces authenticated session.
 * Does NOT check roles — use createAuthorizedAction for role-gated operations.
 */
export function createSafeAction<TSchema extends ZodSchema, TOutput>(
  schema: TSchema,
  handler: (
    data: z.infer<TSchema>,
    ctx: ActionContext
  ) => Promise<TOutput>
): SafeAction<z.infer<TSchema>, TOutput> {
  return async (input: z.infer<TSchema>): Promise<ActionResult<TOutput>> => {
    // 1. Parse & validate input FIRST — never trust client data
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".");
        fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
      }
      return {
        success: false,
        error: "Validation failed",
        fieldErrors,
      };
    }

    // 2. Enforce authentication — reject unauthenticated callers
    let session;
    try {
      session = await auth.api.getSession({
        headers: await headers(),
      });
    } catch {
      return { success: false, error: "Authentication service unavailable" };
    }

    if (!session?.user) {
      return { success: false, error: "Unauthorized: no active session" };
    }

    // 3. Build context — branchId and role MUST come from the verified session.
    //    SECURITY: No fallback defaults — missing role or branchId is a hard reject.
    //    A 'staff' default would silently grant access to users whose session is
    //    missing a role assignment (e.g. mid-migration, broken OAuth callback).
    const rawUser = session.user as Record<string, unknown>;
    const role = rawUser.role;
    const branchId = rawUser.branchId;

    if (typeof role !== "string" || role.trim() === "") {
      console.error("[safe-action] session missing role for user:", session.user.id);
      return { success: false, error: "Forbidden: user role not assigned" };
    }

    if (typeof branchId !== "string" || branchId.trim() === "") {
      console.error("[safe-action] session missing branchId for user:", session.user.id);
      return { success: false, error: "Forbidden: user has no branch assignment" };
    }

    const ctx: ActionContext = {
      session: {
        user: {
          id: session.user.id,
          email: session.user.email,
          role,
        },
        branchId,
      },
    };

    // 4. Execute business logic
    try {
      const data = await handler(parsed.data, ctx);
      return { success: true, data };
    } catch (err) {
      return { success: false, error: sanitizeError(err) };
    }
  };
}

// ─── Role-Gated Wrapper ───────────────────────────────────────────────────────

/**
 * createAuthorizedAction
 * Extends createSafeAction with RBAC role enforcement.
 * Pass an array of roles that are permitted to call this action.
 *
 * Example:
 *   const deleteInvoice = createAuthorizedAction(
 *     z.object({ id: z.string() }),
 *     ['admin', 'manager'],
 *     async ({ id }, ctx) => { ... }
 *   )
 */
export function createAuthorizedAction<TSchema extends ZodSchema, TOutput>(
  schema: TSchema,
  allowedRoles: string[],
  handler: (
    data: z.infer<TSchema>,
    ctx: ActionContext
  ) => Promise<TOutput>
): SafeAction<z.infer<TSchema>, TOutput> {
  return createSafeAction(schema, async (data, ctx) => {
    if (!allowedRoles.includes(ctx.session.user.role)) {
      // SECURITY: Use ActionError so the message surfaces to the client;
      // a generic 'Request failed' for a permission denied is confusing UX.
      throw new ActionError(
        `Forbidden: role '${ctx.session.user.role}' cannot perform this action`
      );
    }
    return handler(data, ctx);
  });
}
