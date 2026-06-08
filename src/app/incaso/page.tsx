import { requireRole } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/ui/page-header";
import { IncasoList } from "@/components/incaso/incaso-list";
import { listOrdersByStatus } from "@/server/queries";

export default async function IncasoPage() {
  const user = await requireRole("incaso");
  const delivered = await listOrdersByStatus(["delivered"], user.cabangId);

  return (
    <DashboardShell userName={user.name} roleId={user.roleId} cabangId={user.cabangId}>
      <PageHeader
        title="Pelunasan / Incaso"
        desc={`${delivered.length} order terkirim menunggu pembayaran`}
      />
      <IncasoList orders={delivered} />
    </DashboardShell>
  );
}
