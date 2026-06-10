/*
Tujuan: Menampilkan status daily closing dan kontrol closing/penguncian sesuai role.
Caller: Route /closing.
Dependensi: Session guard, query closing, RBAC, DashboardShell, dan ClosingPanel.
Main Functions: ClosingPage.
Side Effects: Membaca sesi dan database melalui server query.
*/

import { requireUser } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/ui/page-header";
import { ClosingPanel } from "@/components/closing/closing-panel";
import { getClosingState, namaCabang } from "@/server/queries";
import { canAccessRole, roleNameFromId } from "@/lib/roles";
import { tglPendek } from "@/lib/format";

export default async function ClosingPage() {
  const user = await requireUser();
  const [state, cabang] = await Promise.all([
    getClosingState(user.cabangId),
    namaCabang(user.cabangId),
  ]);
  const roleName = roleNameFromId(user.roleId);

  return (
    <DashboardShell userName={user.name} roleId={user.roleId} cabangId={user.cabangId}>
      <PageHeader
        title="Daily Closing"
        desc="Setiap divisi wajib closing di akhir hari. Owner mengunci tanggal — data jadi permanen."
      />
      <ClosingPanel
        tanggalLabel={tglPendek(`${state.tanggal}T00:00:00`)}
        cabangNama={cabang}
        divisi={state.divisi}
        isLocked={state.isLocked}
        actorRole={roleName}
        isOwner={canAccessRole(roleName, "owner")}
      />
    </DashboardShell>
  );
}
