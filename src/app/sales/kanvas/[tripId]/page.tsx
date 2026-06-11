/*
Tujuan: Detail trip kanvas — sisa muatan, penerbitan faktur di toko, kirim WA, akhiri trip.
Caller: Daftar trip di /sales/kanvas.
Dependensi: Session guard, query kanvas, master toko/diskon, dan komponen kanvas.
Main Functions: TripDetailPage.
Side Effects: Membaca sesi dan database.
*/

import Link from "next/link";
import { requireRole } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { KanvasOrderForm } from "@/components/kanvas/kanvas-order-form";
import { KirimWaButton } from "@/components/kanvas/kirim-wa-button";
import { CatatBayarKanvas } from "@/components/kanvas/catat-bayar-kanvas";
import { AkhiriTripForm } from "@/components/kanvas/akhiri-trip-form";
import { masterForOrderEntry } from "@/server/queries";
import { getTripDetail, listTokoForKanvas, TRIP_STATUS_LABEL } from "@/server/kanvas-queries";
import { rupiah, tglPendek } from "@/lib/format";

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const user = await requireRole("sales");
  const { tripId } = await params;
  const detail = await getTripDetail(Number(tripId));

  if (!detail || detail.trip.salesUserId !== Number(user.id)) {
    return (
      <DashboardShell userName={user.name} roleId={user.roleId} cabangId={user.cabangId}>
        <p className="rounded-md border border-dashed p-6 text-center text-muted-foreground">
          Trip tidak ditemukan atau bukan milik Anda.
        </p>
      </DashboardShell>
    );
  }

  const { trip, items, fakturs } = detail;
  const [tokos, master] = await Promise.all([
    listTokoForKanvas(user.cabangId),
    masterForOrderEntry(user.cabangId),
  ]);
  const hargaOf = new Map(master.produks.map((p) => [p.id, p.harga]));
  const produkMuatan = items.map((i) => ({
    produkId: i.produkId,
    nama: i.nama,
    satuan: i.satuan,
    harga: hargaOf.get(i.produkId) ?? 0,
    sisa: i.sisa,
  }));

  return (
    <DashboardShell userName={user.name} roleId={user.roleId} cabangId={user.cabangId}>
      <PageHeader title={`Trip Kanvas #${trip.id}`} desc={`${trip.tujuan} · ${TRIP_STATUS_LABEL[trip.status]}`}>
        {trip.status === "berjalan" && (
          <AkhiriTripForm tripId={trip.id} items={items.map((i) => ({ produkId: i.produkId, nama: i.nama, satuan: i.satuan, sisa: i.sisa }))} />
        )}
      </PageHeader>

      {trip.status === "diajukan" && (
        <p className="mb-4 rounded-md border border-l-4 border-l-accent bg-accent/10 p-3 text-sm font-semibold">
          Menunggu konfirmasi muat dari Gudang sebelum trip bisa berjalan.
        </p>
      )}
      {trip.status === "rekonsiliasi" && (
        <p className="mb-4 rounded-md border border-l-4 border-l-accent bg-accent/10 p-3 text-sm font-semibold">
          Trip diakhiri — menunggu verifikasi rekonsiliasi Gudang.
        </p>
      )}
      {trip.status === "selesai" && trip.catatanSelisih && (
        <p className="mb-4 rounded-md border border-l-4 border-l-critical bg-critical/10 p-3 text-sm font-semibold text-critical">
          Catatan selisih: {trip.catatanSelisih}
        </p>
      )}

      {/* Muatan */}
      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Muatan Kendaraan
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-1.5 pr-3 font-semibold">Produk</th>
                <th className="py-1.5 pr-3 text-right font-semibold">Muat</th>
                <th className="py-1.5 pr-3 text-right font-semibold">Terjual</th>
                <th className="py-1.5 pr-3 text-right font-semibold">Sisa</th>
                <th className="py-1.5 text-right font-semibold">Kembali</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.produkId} className="border-b last:border-0">
                  <td className="py-1.5 pr-3">{i.nama} <span className="text-muted-foreground">/ {i.satuan}</span></td>
                  <td className="py-1.5 pr-3 text-right tabular">{i.qtyMuat}</td>
                  <td className="py-1.5 pr-3 text-right tabular">{i.qtyTerjual}</td>
                  <td className="py-1.5 pr-3 text-right tabular font-bold">{i.sisa}</td>
                  <td className="py-1.5 text-right tabular">{i.qtyKembali ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Faktur baru — hanya saat trip berjalan */}
      {trip.status === "berjalan" && (
        <section className="mt-6">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Buat Faktur di Toko
          </h2>
          <KanvasOrderForm tripId={trip.id} tokos={tokos} produks={produkMuatan} diskon={master.diskon} />
        </section>
      )}

      {/* Daftar faktur trip */}
      <section className="mt-6">
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Faktur Trip Ini
        </h2>
        {fakturs.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-muted-foreground">Belum ada faktur.</p>
        ) : (
          <div className="space-y-3">
            {fakturs.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card p-4">
                <Link href={`/order/${f.id}`} className="tabular font-bold text-primary hover:underline">INV-{f.id}</Link>
                <span className="font-semibold">{f.tokoNama}</span>
                <span className="text-sm text-muted-foreground">{tglPendek(f.tanggal.toISOString())}</span>
                <span className="tabular font-bold">{rupiah(f.total)}</span>
                <StatusPill status={f.status} />
                <span className="ml-auto flex flex-wrap gap-2">
                  <KirimWaButton orderId={f.id} shareToken={f.shareToken} noTelp={f.tokoNoTelp} tokoNama={f.tokoNama} total={f.total} />
                  {f.status === "delivered" && <CatatBayarKanvas orderId={f.id} total={f.total} />}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="mt-6">
        <Link href="/sales/kanvas" className="text-sm text-muted-foreground hover:underline">← Kembali ke daftar trip</Link>
      </p>
    </DashboardShell>
  );
}
