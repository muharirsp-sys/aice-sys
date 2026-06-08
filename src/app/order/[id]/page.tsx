import Link from "next/link";
import { MapPin, ExternalLink, Camera, AlertOctagon } from "lucide-react";
import { requireUser } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { getOrderDetail } from "@/server/queries";
import { roleNameFromId } from "@/lib/roles";
import { subtotalItem, totalItems } from "@/lib/pricing-calc";
import { rupiah, tglPendek } from "@/lib/format";

function mapsHref(gps: string) {
  return `https://www.google.com/maps?q=${encodeURIComponent(gps.replace(/\s/g, ""))}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const detail = await getOrderDetail(Number(id));

  if (!detail) {
    return (
      <DashboardShell userName={user.name} roleId={user.roleId} cabangId={user.cabangId}>
        <p className="rounded-md border border-dashed p-6 text-center text-muted-foreground">
          Order #{id} tidak ditemukan.
        </p>
      </DashboardShell>
    );
  }

  const { order: o, approval, pengiriman, pembayaran, issues } = detail;
  const isOwner = roleNameFromId(user.roleId) === "owner";

  // Scoping: non-owner hanya boleh melihat order cabangnya.
  if (!isOwner && o.cabangId !== user.cabangId) {
    return (
      <DashboardShell userName={user.name} roleId={user.roleId} cabangId={user.cabangId}>
        <p className="rounded-md border border-l-4 border-l-critical bg-critical/10 p-4 text-sm font-semibold text-critical">
          Order ini di luar cabang Anda.
        </p>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell userName={user.name} roleId={user.roleId} cabangId={user.cabangId}>
      <PageHeader title={`Order #${o.id}`} desc={`${o.tokoNama} · ${o.cabangNama} · ${tglPendek(o.tanggal)}`}>
        <StatusPill status={o.status} />
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Item */}
        <Section title="Item & Harga">
          <table className="w-full text-sm">
            <tbody>
              {o.items.map((i) => (
                <tr key={i.produkId} className="border-b last:border-0">
                  <td className="py-2">{i.nama} <span className="text-muted-foreground">/ {i.satuan}</span></td>
                  <td className="py-2 text-right tabular">{i.qty}×{rupiah(i.hargaSatuan)}</td>
                  <td className="py-2 text-right tabular font-semibold">{rupiah(subtotalItem(i))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} className="pt-3 text-right font-semibold">Total</td>
                <td className="pt-3 text-right tabular text-lg font-extrabold">{rupiah(totalItems(o.items))}</td>
              </tr>
            </tfoot>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">
            Dibuat oleh Sales {o.salesNama} — tanpa unggah bukti (sesuai kebijakan).
          </p>
        </Section>

        {/* Approval */}
        <Section title="Persetujuan (Admin Fakturist)">
          {approval ? (
            <div className="text-sm">
              <StatusPill status={approval.status === "approved" ? "approved" : "rejected"} />
              <p className="mt-2 text-muted-foreground">
                Oleh {approval.adminNama}
                {approval.approvedAt ? ` · ${tglPendek(approval.approvedAt.toISOString())}` : ""}
              </p>
              {approval.alasanTolak && (
                <p className="mt-2 rounded-md bg-critical/10 p-2 text-critical">Alasan tolak: {approval.alasanTolak}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Belum diproses.</p>
          )}
        </Section>

        {/* Bukti Pengiriman (Delivery) */}
        <Section title="Bukti Pengiriman (Delivery)">
          {pengiriman ? (
            <div className="flex gap-4">
              <a
                href={pengiriman.buktiUrl ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="block size-28 shrink-0 overflow-hidden rounded-md border bg-muted"
              >
                {pengiriman.buktiUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pengiriman.buktiUrl} alt="Foto bukti terima" loading="lazy" decoding="async" className="size-full object-cover" />
                ) : (
                  <span className="grid size-full place-items-center"><Camera className="size-6 text-muted-foreground" /></span>
                )}
              </a>
              <div className="text-sm">
                <p className="font-semibold">Diterima · {pengiriman.deliveryNama}</p>
                {pengiriman.diterima && (
                  <p className="text-muted-foreground">{tglPendek(pengiriman.diterima.toISOString())}</p>
                )}
                {pengiriman.gps && (
                  <a href={mapsHref(pengiriman.gps)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-primary hover:underline">
                    <MapPin className="size-3.5" /> <span className="tabular">{pengiriman.gps}</span> <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Belum dikirim.</p>
          )}
        </Section>

        {/* Bukti Pembayaran (Incaso) */}
        <Section title="Bukti Pembayaran (Incaso)">
          {pembayaran ? (
            <div className="flex gap-4">
              <a
                href={pembayaran.buktiUrl ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="block size-28 shrink-0 overflow-hidden rounded-md border bg-muted"
              >
                {pembayaran.buktiUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pembayaran.buktiUrl} alt="Bukti pembayaran" loading="lazy" decoding="async" className="size-full object-cover" />
                ) : (
                  <span className="grid size-full place-items-center"><Camera className="size-6 text-muted-foreground" /></span>
                )}
              </a>
              <div className="text-sm">
                <p className="tabular text-lg font-bold">{rupiah(pembayaran.jumlah)}</p>
                <p className="capitalize text-muted-foreground">{pembayaran.metode} · {pembayaran.incasoNama}</p>
                <p className="text-muted-foreground">{tglPendek(pembayaran.tanggalBayar.toISOString())}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Belum dibayar.</p>
          )}
        </Section>
      </div>

      {/* Issues */}
      {issues.length > 0 && (
        <div className="mt-4">
          <Section title="Laporan Kendala / Selisih">
            <ul className="space-y-2">
              {issues.map((i) => (
                <li key={i.id} className="flex items-start gap-2 text-sm">
                  <AlertOctagon className="mt-0.5 size-4 shrink-0 text-critical" />
                  <span>
                    <span className="font-semibold uppercase">{i.role}</span> — {i.deskripsi}{" "}
                    <span className="text-muted-foreground">({i.pelaporNama} · {tglPendek(i.waktu.toISOString())}{i.selesai ? " · selesai" : ""})</span>
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      <p className="mt-6">
        <Link href="/owner" className="text-sm text-muted-foreground hover:underline">← Kembali ke dashboard</Link>
      </p>
    </DashboardShell>
  );
}
