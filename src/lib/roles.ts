/*
Tujuan: Sumber kebenaran role, dashboard, label, dan aturan akses lintas role.
Caller: Session guard, navigasi, halaman, server action, dan audit.
Dependensi: Data role deterministik dari src/db/seed.ts.
Main Functions: roleNameFromId, dashboardPathForRoleId, canAccessRole, hasGlobalDataAccess.
Side Effects: Tidak ada.
*/

export const ROLE_NAMES = [
  "sales",
  "admin_fakturist",
  "gudang",
  "delivery",
  "incaso",
  "owner",
  "super_admin",
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

// role.id -> role_name (selaras dengan seed).
export const ROLE_BY_ID: Record<number, RoleName> = {
  1: "sales",
  2: "admin_fakturist",
  3: "gudang",
  4: "delivery",
  5: "incaso",
  6: "owner",
  7: "super_admin",
};

// role_name -> path dashboard.
export const ROLE_DASHBOARD: Record<RoleName, string> = {
  sales: "/sales",
  admin_fakturist: "/admin",
  gudang: "/gudang",
  delivery: "/delivery",
  incaso: "/incaso",
  owner: "/owner",
  super_admin: "/owner",
};

// Label tampilan per peran.
export const ROLE_LABEL: Record<RoleName, string> = {
  sales: "Sales",
  admin_fakturist: "Admin Fakturist",
  gudang: "Gudang",
  delivery: "Delivery",
  incaso: "Incaso",
  owner: "Owner",
  super_admin: "Super Admin",
};

export function roleNameFromId(roleId: number): RoleName | null {
  return ROLE_BY_ID[roleId] ?? null;
}

export function dashboardPathForRoleId(roleId: number): string | null {
  const name = roleNameFromId(roleId);
  return name ? ROLE_DASHBOARD[name] : null;
}

export function canAccessRole(
  actorRole: RoleName | null,
  requiredRole: RoleName,
): boolean {
  return actorRole === "super_admin" || actorRole === requiredRole;
}

export function hasGlobalDataAccess(role: RoleName | null): boolean {
  return role === "owner" || role === "super_admin";
}
