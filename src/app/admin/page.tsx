import { FileSpreadsheet } from "lucide-react";
import { requireRole } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/ui/page-header";
import { ApprovalList } from "@/components/admin/approval-list";
import { TandaTerimaAdminPanel } from "@/components/admin/tanda-terima-admin-panel";
import {
  listOrdersByStatus,
  listOrdersForTandaTerima,
  listTandaTerimaForAdmin,
} from "@/server/queries";
import { btn } from "@/lib/ui";

export default async function AdminPage() {
  const user = await requireRole("admin_fakturist");
  const [pending, availableOrders, rawTTs] = await Promise.all([
    listOrdersByStatus(["pending_approval"], user.cabangId),
    listOrdersForTandaTerima(user.cabangId),
    listTandaTerimaForAdmin(user.cabangId),
  ]);

  // Serialize Date → string for client components
  const recentTTs = rawTTs.map((tt) => ({
    id: tt.id,
    tanggal: tt.tanggal.toISOString(),
    status: tt.status,
    adminNama: tt.adminNama,
    jumlahNota: tt.jumlahNota,
  }));

  return (
    <DashboardShell userName={user.name} roleId={user.roleId} cabangId={user.cabangId}>
      <PageHeader
        title="Approval & Faktur"
        desc={`${pending.length} order menunggu persetujuan · ${availableOrders.length} nota siap tanda terima`}
      >
        <a href="/pdf/rekap" target="_blank" rel="noopener noreferrer" className={btn.outline}>
          <FileSpreadsheet className="size-4" /> Cetak Rekap PDF
        </a>
      </PageHeader>

      <ApprovalList orders={pending} />

      <section className="mt-8">
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Tanda Terima
        </h2>
        <TandaTerimaAdminPanel availableOrders={availableOrders} recentTTs={recentTTs} />
      </section>
    </DashboardShell>
  );
}
