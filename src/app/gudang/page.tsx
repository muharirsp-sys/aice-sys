import { ClipboardList } from "lucide-react";
import { requireRole } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/ui/page-header";
import { GudangList } from "@/components/gudang/gudang-list";
import { CetakMassalPanel } from "@/components/gudang/cetak-massal-panel";
import { TandaTerimaGudangPanel } from "@/components/gudang/tanda-terima-gudang-panel";
import { KendalaLaporPanel } from "@/components/gudang/kendala-lapor-panel";
import { GudangMuatanPanel, type GudangTripView } from "@/components/kanvas/gudang-muatan-panel";
import { btn } from "@/lib/ui";
import {
  listOrdersByStatus,
  listUnprintedApproved,
  listUnPickListedApproved,
  listPendingTandaTerimaForGudang,
  getTandaTerimaItems,
  listOrdersForKendala,
} from "@/server/queries";
import { getTripDetail, listTripsForGudang } from "@/server/kanvas-queries";

export default async function GudangPage() {
  const user = await requireRole("gudang");
  const [approved, tripRows, unprinted, unpicklisted, rawPendingTTs, ordersForKendala] = await Promise.all([
    listOrdersByStatus(["approved"], user.cabangId),
    listTripsForGudang(user.cabangId),
    listUnprintedApproved(user.cabangId),
    listUnPickListedApproved(user.cabangId),
    listPendingTandaTerimaForGudang(user.cabangId),
    listOrdersForKendala(user.cabangId),
  ]);

  // Fetch items for each pending TT and serialize dates
  const pendingTTs = await Promise.all(
    rawPendingTTs.map(async (tt) => ({
      id: tt.id,
      tanggal: tt.tanggal.toISOString(),
      adminNama: tt.adminNama,
      items: await getTandaTerimaItems(tt.id),
    })),
  );

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
        <a
          href="/pdf/picklist-agg"
          target="_blank"
          rel="noopener noreferrer"
          className={unpicklisted.length > 0 ? btn.outline : btn.ghost}
        >
          <ClipboardList className="size-4" /> Pick List Gabungan ({unpicklisted.length})
        </a>
      </PageHeader>

      {pendingTTs.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Konfirmasi Tanda Terima ({pendingTTs.length})
          </h2>
          <TandaTerimaGudangPanel pendingTTs={pendingTTs} />
        </section>
      )}

      <CetakMassalPanel unprinted={unprinted} />
      <GudangList orders={approved} />

      {ordersForKendala.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Lapor Kendala Barang
          </h2>
          <KendalaLaporPanel orders={ordersForKendala} />
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Muatan Kanvas
        </h2>
        <GudangMuatanPanel trips={trips} />
      </section>
    </DashboardShell>
  );
}
