import { FileSpreadsheet } from "lucide-react";
import { requireRole } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/ui/page-header";
import { GudangList } from "@/components/gudang/gudang-list";
import { btn } from "@/lib/ui";
import { listOrdersByStatus } from "@/server/queries";

export default async function GudangPage() {
  const user = await requireRole("gudang");
  const approved = await listOrdersByStatus(["approved"], user.cabangId);

  return (
    <DashboardShell userName={user.name} roleId={user.roleId} cabangId={user.cabangId}>
      <PageHeader
        title="Persiapan Gudang"
        desc={`${approved.length} pick list disetujui menunggu persiapan`}
      >
        <a href="/pdf/rekap" target="_blank" rel="noopener noreferrer" className={btn.outline}>
          <FileSpreadsheet className="size-4" /> Cetak Rekap PDF
        </a>
      </PageHeader>
      <GudangList orders={approved} />
    </DashboardShell>
  );
}
