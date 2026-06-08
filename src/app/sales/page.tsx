import Link from "next/link";
import { requireRole } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-pill";
import { OrderEntryForm } from "@/components/sales/order-entry-form";
import { masterForOrderEntry, listRecentOrders } from "@/server/queries";
import { totalItems } from "@/lib/pricing-calc";
import { rupiah, tglPendek } from "@/lib/format";
import type { OrderView } from "@/lib/order-status";

const columns: Column<OrderView>[] = [
  { header: "No", cell: (o) => <Link href={`/order/${o.id}`} className="tabular font-semibold text-primary hover:underline">#{o.id}</Link> },
  { header: "Toko", cell: (o) => o.tokoNama },
  { header: "Tanggal", cell: (o) => tglPendek(o.tanggal) },
  { header: "Total", align: "right", cell: (o) => rupiah(totalItems(o.items)) },
  { header: "Status", cell: (o) => <StatusPill status={o.status} /> },
];

export default async function SalesPage() {
  const user = await requireRole("sales");
  const [master, recent] = await Promise.all([
    masterForOrderEntry(user.cabangId),
    listRecentOrders(user.cabangId),
  ]);

  return (
    <DashboardShell userName={user.name} roleId={user.roleId} cabangId={user.cabangId}>
      <PageHeader
        title="Order Entry"
        desc="Buat pesanan toko — harga otomatis, diskon terbatas. Tanpa unggah bukti."
      />
      <OrderEntryForm tokos={master.tokos} produks={master.produks} diskon={master.diskon} />

      <section className="mt-8">
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Pesanan Terbaru
        </h2>
        <DataTable columns={columns} rows={recent} getRowKey={(o) => o.id} />
      </section>
    </DashboardShell>
  );
}
