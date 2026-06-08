import { requireRole } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/ui/page-header";
import { DeliveryList } from "@/components/delivery/delivery-list";
import { listOrdersByStatus } from "@/server/queries";

export default async function DeliveryPage() {
  const user = await requireRole("delivery");
  const ready = await listOrdersByStatus(["ready_to_ship"], user.cabangId);

  return (
    <DashboardShell userName={user.name} roleId={user.roleId} cabangId={user.cabangId}>
      <PageHeader
        title="Pengiriman"
        desc={`${ready.length} order siap kirim · wajib unggah foto terima + GPS`}
      />
      <DeliveryList orders={ready} />
    </DashboardShell>
  );
}
