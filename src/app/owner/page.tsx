import Link from "next/link";
import { requireRole, getEffectiveCabangId } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { TrafficLightList } from "@/components/ui/traffic-light-list";
import { KendalaApprovalPanel } from "@/components/owner/kendala-approval-panel";
import { rupiah } from "@/lib/format";
import { ownerDashboard, listCabangAll, listKendalaForOwner } from "@/server/queries";
import { deltaPersenOf } from "@/lib/pricing-calc";
import type { AlertLevel } from "@/lib/order-status";

const DOT: Record<AlertLevel, string> = {
  critical: "bg-critical",
  warning: "bg-warning",
  ok: "bg-ok",
};

export default async function OwnerDashboard() {
  const user = await requireRole("owner");
  const effectiveCabangId = await getEffectiveCabangId(user);
  const [d, cabangs, kendalaItems] = await Promise.all([
    ownerDashboard(effectiveCabangId),
    listCabangAll(),
    listKendalaForOwner(effectiveCabangId),
  ]);
  const delta = deltaPersenOf(d.pendapatanHariIni, d.pendapatanKemarin);
  const cabangLabel = effectiveCabangId
    ? (cabangs.find((c) => c.id === effectiveCabangId)?.nama ?? "Cabang")
    : "Semua Cabang";

  return (
    <DashboardShell
      userName={user.name}
      roleId={user.roleId}
      cabangId={user.cabangId}
      cabangs={cabangs}
      effectiveCabangId={effectiveCabangId}
    >
      <PageHeader title="Dashboard Owner" desc={`${cabangLabel} · diperbarui real-time`} />

      <section className="grid gap-4 sm:grid-cols-3">
        <KpiCard title="Pendapatan Hari Ini" value={rupiah(d.pendapatanHariIni)} delta={delta} />
        <KpiCard
          title="Order Aktif"
          value={String(d.counts.aktif)}
          sub={`${d.counts.pending} pending · ${d.counts.dikirim} dikirim · ${d.counts.lunas} lunas`}
        />
        <KpiCard
          title="Kendala Belum Tertangani"
          value={String(d.issues.length)}
          sub="dari gudang & incaso"
          valueClass="text-critical"
        />
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Traffic Light Alert
          </h2>
          <TrafficLightList alerts={d.alerts} />
        </section>

        <section className="lg:col-span-2">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Ringkasan Cabang
          </h2>
          <div className="overflow-hidden rounded-lg border">
            {d.ringkasan.map((c) => (
              <div key={c.cabangId} className="flex items-center gap-3 border-b bg-card px-4 py-3 last:border-0">
                <span className={`size-2.5 shrink-0 rounded-full ${DOT[c.level]}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{c.nama}</p>
                  <p className="text-xs text-muted-foreground">{c.aktif} order aktif</p>
                </div>
                <span className="tabular text-sm font-bold">{rupiah(c.pendapatan)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {kendalaItems.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Persetujuan Kendala Barang ({kendalaItems.length})
          </h2>
          <KendalaApprovalPanel items={kendalaItems} />
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Laporan Kendala (belum tertangani)
        </h2>
        {d.issues.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Tidak ada kendala aktif.</p>
        ) : (
          <ul className="space-y-2">
            {d.issues.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-card px-4 py-3">
                <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-semibold uppercase">{i.role}</span>
                <Link href={`/order/${i.orderId}`} className="tabular text-sm font-semibold text-primary hover:underline">#{i.orderId}</Link>
                <span className="flex-1 text-sm">{i.deskripsi}</span>
                <span className="text-xs text-muted-foreground">{i.cabangNama} · {i.time}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </DashboardShell>
  );
}
