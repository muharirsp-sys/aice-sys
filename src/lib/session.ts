import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import {
  dashboardPathForRoleId,
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

// Wajib login + peran tertentu. Jika peran tidak cocok, alihkan ke dashboard miliknya.
export async function requireRole(allowed: RoleName) {
  const user = await requireUser();
  const roleName = roleNameFromId(user.roleId);
  if (roleName !== allowed) {
    redirect(dashboardPathForRoleId(user.roleId) ?? "/login");
  }
  return user;
}
