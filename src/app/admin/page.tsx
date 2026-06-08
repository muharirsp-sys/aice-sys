import { requireRole } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/ui/page-header";
import { ApprovalList } from "@/components/admin/approval-list";
import { listOrdersByStatus } from "@/server/queries";

export default async function AdminPage() {
  const user = await requireRole("admin_fakturist");
  const pending = await listOrdersByStatus(["pending_approval"], user.cabangId);

  return (
    <DashboardShell userName={user.name} roleId={user.roleId} cabangId={user.cabangId}>
      <PageHeader
        title="Approval & Faktur"
        desc={`${pending.length} order menunggu persetujuan · cetak faktur & pick list setelah disetujui`}
      />
      <ApprovalList orders={pending} />
    </DashboardShell>
  );
}
