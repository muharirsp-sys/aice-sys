/*
Tujuan: Halaman trip kanvas sales — daftar trip dan pengajuan trip baru.
Caller: Navigasi dari dashboard Sales.
Dependensi: Session guard, query kanvas, master produk, dan DashboardShell.
Main Functions: SalesKanvasPage.
Side Effects: Membaca sesi dan database.
*/

import Link from "next/link";
import { requireRole } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type Column } from "@/components/ui/data-table";
import { TripForm } from "@/components/kanvas/trip-form";
import { masterForOrderEntry } from "@/server/queries";
import { listTripsForSales, TRIP_STATUS_LABEL, type TripRow } from "@/server/kanvas-queries";
import { tglPendek } from "@/lib/format";

const columns: Column<TripRow>[] = [
  { header: "Trip", cell: (t) => <Link href={`/sales/kanvas/${t.id}`} className="tabular font-semibold text-primary hover:underline">#{t.id}</Link> },
  { header: "Tujuan", cell: (t) => t.tujuan },
  { header: "Berangkat", cell: (t) => (t.tanggalBerangkat ? tglPendek(t.tanggalBerangkat.toISOString()) : "—") },
  { header: "Kembali", cell: (t) => (t.tanggalKembali ? tglPendek(t.tanggalKembali.toISOString()) : "—") },
  { header: "Qty Muat", align: "right", cell: (t) => t.totalItemMuat },
  { header: "Status", cell: (t) => TRIP_STATUS_LABEL[t.status] },
];

export default async function SalesKanvasPage() {
  const user = await requireRole("sales");
  const [trips, master] = await Promise.all([
    listTripsForSales(Number(user.id)),
    masterForOrderEntry(user.cabangId),
  ]);
  const adaTripAktif = trips.some((t) => t.status !== "selesai");

  return (
    <DashboardShell userName={user.name} roleId={user.roleId} cabangId={user.cabangId}>
      <PageHeader
        title="Kanvas Luar Kota"
        desc="Muat barang sekali, buat faktur langsung di toko, kirim via WhatsApp."
      />

      {adaTripAktif ? (
        <p className="rounded-md border border-l-4 border-l-primary bg-primary/5 p-3 text-sm font-semibold">
          Ada trip yang masih aktif — selesaikan dulu sebelum mengajukan trip baru.
        </p>
      ) : (
        <TripForm produks={master.produks.map((p) => ({ id: p.id, nama: p.nama, satuan: p.satuan }))} />
      )}

      <section className="mt-8">
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Riwayat Trip
        </h2>
        <DataTable columns={columns} rows={trips} getRowKey={(t) => t.id} empty="Belum ada trip kanvas." />
      </section>
    </DashboardShell>
  );
}
