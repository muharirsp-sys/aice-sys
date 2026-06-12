/*
Tujuan: Halaman Inventory — Posisi Stok & Kartu Stok (Stock Movement).
Caller: Next.js App Router (/dashboard/inventory).
Dependensi: RSC direct DB query, DashboardShell, InventoryTabs (Client Component).
Akses: owner + super_admin (global); gudang melihat cabang sendiri.
*/

import { Package } from "lucide-react";
import { requireUser } from "@/lib/session";
import { hasGlobalDataAccess, roleNameFromId } from "@/lib/roles";
import { getEffectiveCabangId } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/ui/page-header";
import { getPosisiStok, getKartuStok } from "@/server/inventory-queries";
import { InventoryTabs } from "./_components/inventory-tabs";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const user = await requireUser();
  const roleName = roleNameFromId(user.roleId);
  const isGlobal = hasGlobalDataAccess(roleName);

  // Global users (owner/super_admin) bisa melihat semua cabang atau cabang aktif via cookie.
  // Non-global selalu dibatasi ke cabangId mereka sendiri.
  const effectiveCabangId = isGlobal
    ? await getEffectiveCabangId({ cabangId: user.cabangId, roleId: user.roleId })
    : user.cabangId;

  // Direct DB queries — tidak melewati API route (RSC pattern).
  const [posisiStok, kartuStok] = await Promise.all([
    getPosisiStok(effectiveCabangId),
    getKartuStok(effectiveCabangId),
  ]);

  const totalSKU = posisiStok.length;
  const totalStok = posisiStok.reduce((sum, r) => sum + r.qty, 0);
  const stokHabis = posisiStok.filter((r) => r.qty === 0).length;

  return (
    <DashboardShell userName={user.name} roleId={user.roleId} cabangId={user.cabangId}>
      <PageHeader
        title="Manajemen Inventori"
        desc={`${totalSKU} SKU · Total ${totalStok.toLocaleString("id-ID")} unit${stokHabis > 0 ? ` · ${stokHabis} stok habis` : ""}`}
      >
        <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
          <Package className="size-3.5" />
          {effectiveCabangId == null ? "Semua Cabang" : `Cabang #${effectiveCabangId}`}
        </span>
      </PageHeader>

      <InventoryTabs posisiStok={posisiStok} kartuStok={kartuStok} />
    </DashboardShell>
  );
}
