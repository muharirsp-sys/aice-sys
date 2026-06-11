import { requireRole } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/ui/page-header";
import { LaporanClient } from "@/components/laporan/laporan-client";
import { REPORT_GROUPS_META } from "@/server/reports";
import { listCabangAll, listTokoAll, listProdukAll } from "@/server/queries";

export default async function LaporanPage() {
  const user = await requireRole("owner");

  const [cabangsRaw, tokosRaw, produksRaw] = await Promise.all([
    listCabangAll(),
    listTokoAll(),
    listProdukAll(),
  ]);

  const cabangs = cabangsRaw.map((c) => ({ id: c.id, nama: c.nama }));
  const tokos = tokosRaw.map((t) => ({ id: t.id, nama: t.nama, cabangId: t.cabangId }));
  const produks = produksRaw.map((p) => ({ id: p.id, nama: p.nama }));

  return (
    <DashboardShell userName={user.name} roleId={user.roleId} cabangId={user.cabangId}>
      <PageHeader
        title="Laporan"
        desc="Unduh data master & transaksi dalam format Excel (.xlsx). Saring per tanggal, cabang, customer, dan item."
      />
      <LaporanClient
        groups={REPORT_GROUPS_META}
        cabangs={cabangs}
        tokos={tokos}
        produks={produks}
      />
    </DashboardShell>
  );
}

