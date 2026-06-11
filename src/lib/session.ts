/*
Tujuan: Mengambil sesi Better Auth dan menegakkan guard login/role di server.
Caller: Server Components, route handler, dan server action yang membutuhkan user aktif.
Dependensi: Better Auth, Next headers/redirect, dan pemetaan role.
Main Functions: getCurrentUser, requireUser, requireRole.
Side Effects: Membaca cookie sesi dan dapat melakukan redirect.
*/

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import {
  canAccessRole,
  dashboardPathForRoleId,
  hasGlobalDataAccess,
  roleNameFromId,
  type RoleName,
} from "./roles";

// Sesi user saat ini (atau null). Dipanggil dari Server Component.
export async function getCurrentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

// Wajib login; jika tidak, lempar ke /login.
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

// cabangId efektif untuk global-access user (dari cookie); non-global selalu user.cabangId.
// null = semua cabang (global user tanpa pilihan aktif).
export async function getEffectiveCabangId(user: {
  cabangId: number;
  roleId: number;
}): Promise<number | null> {
  const role = roleNameFromId(user.roleId);
  if (!hasGlobalDataAccess(role)) return user.cabangId;
  const val = (await cookies()).get("active_cabang_id")?.value;
  if (!val) return null;
  const id = Number(val);
  return Number.isNaN(id) ? null : id;
}

// Wajib login + peran tertentu. Jika peran tidak cocok, alihkan ke dashboard miliknya.
export async function requireRole(allowed: RoleName) {
  const user = await requireUser();
  const roleName = roleNameFromId(user.roleId);
  if (!canAccessRole(roleName, allowed)) {
    redirect(dashboardPathForRoleId(user.roleId) ?? "/login");
  }
  return user;
}
