import { requireRole } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/ui/page-header";
import { AuditTable, type AuditRow } from "@/components/audit/audit-table";
import { listAudit } from "@/server/queries";
import { ROLE_LABEL, roleNameFromId } from "@/lib/roles";

const ACTION_LABEL: Record<string, string> = {
  create_order: "Buat Order",
  approve_order: "Setujui Order",
  reject_order: "Tolak Order",
  confirm_ready: "Konfirmasi Siap",
  mark_delivered: "Kirim + Bukti",
  record_payment: "Pembayaran",
  report_shortage: "Lapor Kendala",
  report_selisih: "Lapor Selisih",
  closing: "Closing Divisi",
  lock_date: "Kunci Tanggal",
  teguran: "Teguran",
  print: "Cetak Dokumen",
  master_data: "Master Data",
};

function ringkas(json: string | null): string {
  if (!json) return "—";
  try {
    return Object.entries(JSON.parse(json))
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
  } catch {
    return json;
  }
}

function waktu(d: Date): string {
  return new Date(d).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AuditPage() {
  const user = await requireRole("owner");
  const raw = await listAudit(500);

  const rows: AuditRow[] = raw.map((r) => {
    const rn = roleNameFromId(r.roleId);
    return {
      id: r.id,
      waktu: waktu(r.ts),
      pelaku: `${r.nama} (${rn ? ROLE_LABEL[rn] : "?"})`,
      aksi: ACTION_LABEL[r.action] ?? r.action,
      tabel: r.table,
      detail: ringkas(r.newValue),
    };
  });

  return (
    <DashboardShell userName={user.name} roleId={user.roleId} cabangId={user.cabangId}>
      <PageHeader
        title="Audit Trail"
        desc={`${rows.length} aktivitas tercatat · log permanen anti-fraud (tabel virtualisasi)`}
      />
      <AuditTable rows={rows} />
    </DashboardShell>
  );
}
