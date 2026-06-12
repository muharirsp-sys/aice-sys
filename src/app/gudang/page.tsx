import { ClipboardList } from "lucide-react";
import { requireRole } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/ui/page-header";
import { GudangList } from "@/components/gudang/gudang-list";
import { TandaTerimaGudangPanel } from "@/components/gudang/tanda-terima-gudang-panel";
import { KendalaLaporPanel } from "@/components/gudang/kendala-lapor-panel";
import { GudangMuatanPanel, type GudangTripView } from "@/components/kanvas/gudang-muatan-panel";
import { btn } from "@/lib/ui";
import {
  listApprovedNotInPendingTT,
  listUnPickListedApproved,
  listPendingTandaTerimaForGudang,
  getTandaTerimaItemsWithOrderDetails,
  listOrdersForKendala,
} from "@/server/queries";
import { getTripDetail, listTripsForGudang } from "@/server/kanvas-queries";

export default async function GudangPage() {
  const user = await requireRole("gudang");
  const [approved, tripRows, unpicklisted, rawPendingTTs, ordersForKendala] = await Promise.all([
    listApprovedNotInPendingTT(user.cabangId),
    listTripsForGudang(user.cabangId),
    listUnPickListedApproved(user.cabangId),
    listPendingTandaTerimaForGudang(user.cabangId),
    listOrdersForKendala(user.cabangId),
  ]);

  const pendingTTs = await Promise.all(
    rawPendingTTs.map(async (tt) => ({
      id: tt.id,
      tanggal: tt.tanggal.toISOString(),
      adminNama: tt.adminNama,
      items: await getTandaTerimaItemsWithOrderDetails(tt.id),
    })),
  );

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
        desc={`${approved.length} faktur belum TT · ${unpicklisted.length} belum pick list`}
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
        <section className="mb-8">
          <div className="mb-3">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Langkah 1 · Konfirmasi Tanda Terima ({pendingTTs.length})
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Admin sudah mengirim faktur ke gudang. Cek fisik barang — tandai Sesuai atau isi qty aktual jika berbeda.
            </p>
          </div>
          <TandaTerimaGudangPanel pendingTTs={pendingTTs} />
        </section>
      )}

      <section className="mb-8">
        <div className="mb-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {pendingTTs.length > 0 ? "Langkah 2 · Siapkan Pesanan" : "Siapkan Pesanan"}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Faktur yang sudah disetujui admin dan belum masuk tanda terima. Siapkan barang lalu klik &ldquo;Siap Dikirim&rdquo;.
          </p>
        </div>
        <GudangList orders={approved} />
      </section>

      {ordersForKendala.length > 0 && (
        <section className="mb-8">
          <KendalaLaporPanel orders={ordersForKendala} collapsible />
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
