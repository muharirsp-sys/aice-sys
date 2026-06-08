// Sumber kebenaran tunggal untuk 6 peran (prd.md §2) + pemetaan ke dashboard.
// role.id di-seed deterministik 1..6 (lihat src/db/seed.ts).

export const ROLE_NAMES = [
  "sales",
  "admin_fakturist",
  "gudang",
  "delivery",
  "incaso",
  "owner",
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
};

// role_name -> path dashboard.
export const ROLE_DASHBOARD: Record<RoleName, string> = {
  sales: "/sales",
  admin_fakturist: "/admin",
  gudang: "/gudang",
  delivery: "/delivery",
  incaso: "/incaso",
  owner: "/owner",
};

// Label tampilan per peran.
export const ROLE_LABEL: Record<RoleName, string> = {
  sales: "Sales",
  admin_fakturist: "Admin Fakturist",
  gudang: "Gudang",
  delivery: "Delivery",
  incaso: "Incaso",
  owner: "Owner",
};

export function roleNameFromId(roleId: number): RoleName | null {
  return ROLE_BY_ID[roleId] ?? null;
}

export function dashboardPathForRoleId(roleId: number): string | null {
  const name = roleNameFromId(roleId);
  return name ? ROLE_DASHBOARD[name] : null;
}
