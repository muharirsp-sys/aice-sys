import { FileSpreadsheet, ClipboardList } from "lucide-react";
import { requireRole } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/ui/page-header";
import { GudangList } from "@/components/gudang/gudang-list";
import { CetakMassalPanel } from "@/components/gudang/cetak-massal-panel";
import { GudangMuatanPanel, type GudangTripView } from "@/components/kanvas/gudang-muatan-panel";
import { btn } from "@/lib/ui";
import { listOrdersByStatus, listUnprintedApproved, listUnPickListedApproved } from "@/server/queries";
import { getTripDetail, listTripsForGudang } from "@/server/kanvas-queries";

export default async function GudangPage() {
  const user = await requireRole("gudang");
  const [approved, tripRows, unprinted, unpicklisted] = await Promise.all([
    listOrdersByStatus(["approved"], user.cabangId),
    listTripsForGudang(user.cabangId),
    listUnprintedApproved(user.cabangId),
    listUnPickListedApproved(user.cabangId),
  ]);

  // Lengkapi tiap trip antrean dengan rincian item (muat/terjual/kembali).
  const trips: GudangTripView[] = [];
  for (const t of tripRows) {
    const d = await getTripDetail(t.id);
    if (!d) continue;
    trips.push({
      id: t.id,
      tujuan: t.tujuan,
      status: t.status as GudangTripView["status"],
      salesNama: t.salesNama,
      items: d.items.map((i) => ({
        produkId: i.produkId,
        nama: i.nama,
        satuan: i.satuan,
        qtyMuat: i.qtyMuat,
        qtyTerjual: i.qtyTerjual,
        qtyKembali: i.qtyKembali,
      })),
    });
  }

  return (
    <DashboardShell userName={user.name} roleId={user.roleId} cabangId={user.cabangId}>
      <PageHeader
        title="Persiapan Gudang"
        desc={`${approved.length} nota disetujui · ${unprinted.length} belum dicetak`}
      >
        <a href="/pdf/rekap" target="_blank" rel="noopener noreferrer" className={btn.outline}>
          <FileSpreadsheet className="size-4" /> Cetak Rekap PDF
        </a>
        <a
          href="/pdf/picklist-agg"
          target="_blank"
          rel="noopener noreferrer"
          className={unpicklisted.length > 0 ? btn.outline : btn.ghost}
        >
          <ClipboardList className="size-4" /> Pick List Gabungan ({unpicklisted.length})
        </a>
      </PageHeader>
      <CetakMassalPanel unprinted={unprinted} />
      <GudangList orders={approved} />

      <section className="mt-8">
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Muatan Kanvas
        </h2>
        <GudangMuatanPanel trips={trips} />
      </section>
    </DashboardShell>
  );
}
