import { requireRole } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/ui/page-header";
import { DeliveryList } from "@/components/delivery/delivery-list";
import { KendalaDriverPanel } from "@/components/delivery/kendala-driver-panel";
import { listOrdersByStatus, listKendalaForDriver } from "@/server/queries";

export default async function DeliveryPage() {
  const user = await requireRole("delivery");
  const [ready, kendalaItems] = await Promise.all([
    listOrdersByStatus(["ready_to_ship"], user.cabangId),
    listKendalaForDriver(user.cabangId),
  ]);

  return (
    <DashboardShell userName={user.name} roleId={user.roleId} cabangId={user.cabangId}>
      <PageHeader
        title="Pengiriman"
        desc={`${ready.length} order siap kirim · wajib unggah foto terima + GPS`}
      />
      <DeliveryList orders={ready} />

      {kendalaItems.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Kendala Barang — Konfirmasi Qty Terkirim ({kendalaItems.length})
          </h2>
          <KendalaDriverPanel items={kendalaItems} />
        </section>
      )}
    </DashboardShell>
  );
}
