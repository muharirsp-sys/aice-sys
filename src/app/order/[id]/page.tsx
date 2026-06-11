/*
Tujuan: Menampilkan detail lengkap order beserta approval, pengiriman, pembayaran, dan issue.
Caller: Link order dari dashboard dan audit.
Dependensi: Session guard, query order, RBAC global, pricing, format, dan DashboardShell.
Main Functions: OrderDetailPage.
Side Effects: Membaca sesi dan database.
*/

import Link from "next/link";
import {
  AlertOctagon,
  FileText,
  CheckCircle2,
  Truck,
  Wallet,
  RotateCcw,
} from "lucide-react";
import { requireUser } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { ActivityTimeline, type TimelineNode } from "@/components/ui/timeline";
import { EvidenceViewer } from "@/components/ui/evidence-viewer";
import { DiscrepancyBadge } from "@/components/ui/discrepancy-badge";
import { SlaBadge } from "@/components/ui/sla-badge";
import { getOrderDetail } from "@/server/queries";
import { hasGlobalDataAccess, roleNameFromId } from "@/lib/roles";
import { ResetOrderButton } from "@/components/admin/reset-order-button";
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
  const canViewAllCabang = hasGlobalDataAccess(roleNameFromId(user.roleId));

  // Scoping: user tanpa akses global hanya boleh melihat order cabangnya.
  if (!canViewAllCabang && o.cabangId !== user.cabangId) {
    return (
      <DashboardShell userName={user.name} roleId={user.roleId} cabangId={user.cabangId}>
        <p className="rounded-md border border-l-4 border-l-critical bg-critical/10 p-4 text-sm font-semibold text-critical">
          Order ini di luar cabang Anda.
        </p>
      </DashboardShell>
    );
  }

  // ── Pencocokan bukti silang: tagihan (sistem) vs setoran (incaso) ───────────
  const totalTagihan = totalItems(o.items);
  const selisihBayar = pembayaran ? pembayaran.jumlah - totalTagihan : 0;
  const adaSelisih = pembayaran != null && Math.abs(selisihBayar) > 0;

  // ── Timeline kronologis (siapa → kapan → status lama → baru) ────────────────
  const nodes: TimelineNode[] = [];

  // 1. Order dibuat (Sales)
  nodes.push({
    id: "buat",
    icon: FileText,
    title: o.tipe === "kanvas" ? "Faktur Kanvas terbit" : "Order dibuat",
    pelaku: `Sales ${o.salesNama}`,
    waktu: o.tanggal,
    ke: o.tipe === "kanvas" ? "kanvas" : "pending_approval",
    level: "ok",
    done: true,
    extra: (
      <span className="text-sm text-muted-foreground">
        Total tagihan{" "}
        <span className="tabular font-semibold text-foreground">{rupiah(totalTagihan)}</span> ·{" "}
        {o.items.length} item
      </span>
    ),
  });

  // 2. Persetujuan (Admin Fakturist)
  if (o.tipe === "kanvas") {
    nodes.push({
      id: "approval",
      icon: CheckCircle2,
      title: "Tanpa approval admin",
      pelaku: "Faktur kanvas — terbit langsung di toko",
      level: "ok",
      done: true,
    });
  } else if (approval) {
    const isReset = approval.status === "reset_to_pending";
    const ditolak = !isReset && approval.status !== "approved";
    nodes.push({
      id: "approval",
      icon: isReset ? RotateCcw : CheckCircle2,
      title: isReset ? "Direset ke Pending oleh Owner" : ditolak ? "Order ditolak" : "Order disetujui",
      pelaku: isReset ? `Owner ${approval.adminNama}` : `Admin ${approval.adminNama}`,
      waktu: approval.approvedAt ? approval.approvedAt.toISOString() : null,
      dari: "pending_approval",
      ke: isReset ? "pending_approval" : ditolak ? "rejected" : "approved",
      level: isReset ? "warning" : ditolak ? "critical" : "ok",
      done: true,
      extra: (
        <div className="flex flex-wrap items-center gap-2">
          {!isReset && <SlaBadge since={o.tanggal} until={approval.approvedAt?.toISOString() ?? null} />}
          {approval.alasanTolak && !isReset && (
            <span className="rounded-md bg-critical/10 px-2 py-0.5 text-xs text-critical">
              Alasan tolak: {approval.alasanTolak}
            </span>
          )}
          {isReset && (
            <span className="rounded-md bg-accent/10 px-2 py-0.5 text-xs text-accent-foreground">
              Admin dapat memproses ulang
            </span>
          )}
        </div>
      ),
    });
  } else {
    nodes.push({
      id: "approval",
      icon: CheckCircle2,
      title: "Menunggu persetujuan",
      level: "pending",
      done: false,
      extra: <SlaBadge since={o.tanggal} />,
    });
  }

  // 3. Pengiriman (Delivery)
  if (o.tipe === "kanvas") {
    nodes.push({
      id: "kirim",
      icon: Truck,
      title: "Tanpa tahap delivery",
      pelaku: "Barang diserahkan langsung dari kendaraan",
      level: "ok",
      done: true,
    });
  } else if (pengiriman) {
    nodes.push({
      id: "kirim",
      icon: Truck,
      title: "Barang diterima toko",
      pelaku: `Delivery ${pengiriman.deliveryNama}`,
      waktu: pengiriman.diterima ? pengiriman.diterima.toISOString() : null,
      dari: "ready_to_ship",
      ke: "delivered",
      level: "ok",
      done: true,
      extra: (
        <EvidenceViewer
          title={`Bukti Pengiriman · Order #${o.id}`}
          imageUrl={pengiriman.buktiUrl}
          imageAlt="Foto bukti terima"
          gps={pengiriman.gps}
          mapsHref={pengiriman.gps ? mapsHref(pengiriman.gps) : null}
          triggerLabel="Periksa bukti terima"
          fields={[
            { label: "Penerima / Delivery", value: pengiriman.deliveryNama },
            {
              label: "Waktu terima",
              value: pengiriman.diterima ? tglPendek(pengiriman.diterima.toISOString()) : "—",
            },
            { label: "Koordinat GPS", value: pengiriman.gps ?? "—", mono: true },
            { label: "Total tagihan", value: rupiah(totalTagihan), mono: true },
          ]}
        />
      ),
    });
  } else {
    nodes.push({
      id: "kirim",
      icon: Truck,
      title: "Belum dikirim",
      level: "pending",
      done: false,
    });
  }

  // 4. Pembayaran (Incaso)
  if (pembayaran) {
    nodes.push({
      id: "bayar",
      icon: Wallet,
      title: "Pembayaran diterima",
      pelaku: `Incaso ${pembayaran.incasoNama}`,
      waktu: pembayaran.tanggalBayar.toISOString(),
      dari: "delivered",
      ke: "paid",
      level: adaSelisih ? "warning" : "ok",
      done: true,
      extra: (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="tabular text-sm font-semibold">{rupiah(pembayaran.jumlah)}</span>
            <span className="text-xs capitalize text-muted-foreground">{pembayaran.metode}</span>
            <DiscrepancyBadge selisih={selisihBayar} />
          </div>
          <EvidenceViewer
            title={`Bukti Pembayaran · Order #${o.id}`}
            imageUrl={pembayaran.buktiUrl}
            imageAlt="Bukti pembayaran"
            triggerLabel="Cocokkan setoran vs tagihan"
            fields={[
              { label: "Total tagihan (sistem)", value: rupiah(totalTagihan), mono: true },
              {
                label: "Setoran diterima",
                value: rupiah(pembayaran.jumlah),
                mono: true,
                highlight: adaSelisih ? "warning" : "ok",
              },
              {
                label: "Selisih",
                value: rupiah(Math.abs(selisihBayar)),
                mono: true,
                highlight: adaSelisih ? "critical" : "ok",
              },
              { label: "Metode", value: pembayaran.metode },
              { label: "Kolektor / Incaso", value: pembayaran.incasoNama },
              { label: "Tanggal bayar", value: tglPendek(pembayaran.tanggalBayar.toISOString()) },
            ]}
          />
        </div>
      ),
    });
  } else {
    nodes.push({
      id: "bayar",
      icon: Wallet,
      title: "Belum dibayar",
      level: "pending",
      done: false,
    });
  }

  // 5. Issue / selisih (jika ada) — disisipkan sebagai node kritis di akhir.
  for (const i of issues) {
    nodes.push({
      id: `issue-${i.id}`,
      icon: AlertOctagon,
      title: `Laporan ${i.role}: ${i.deskripsi}`,
      pelaku: i.pelaporNama,
      waktu: i.waktu.toISOString(),
      level: i.selesai ? "ok" : "critical",
      done: i.selesai,
      extra: i.selesai ? (
        <span className="text-xs font-semibold text-ok">Selesai ditindaklanjuti</span>
      ) : (
        <span className="text-xs font-semibold text-critical">Belum selesai</span>
      ),
    });
  }

  return (
    <DashboardShell userName={user.name} roleId={user.roleId} cabangId={user.cabangId}>
      <PageHeader title={`Order #${o.id}`} desc={`${o.tokoNama} · ${o.cabangNama} · ${tglPendek(o.tanggal)}`}>
        {o.tipe === "kanvas" && (
          <span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent-foreground">
            Faktur Kanvas
          </span>
        )}
        {adaSelisih && <DiscrepancyBadge selisih={selisihBayar} />}
        <StatusPill status={o.status} />
        {o.status === "rejected" && hasGlobalDataAccess(roleNameFromId(user.roleId)) && (
          <ResetOrderButton orderId={o.id} />
        )}
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Item & Harga */}
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
                <td className="pt-3 text-right tabular text-lg font-extrabold">{rupiah(totalTagihan)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">
            Dibuat oleh Sales {o.salesNama} — tanpa unggah bukti (sesuai kebijakan).
          </p>
        </Section>

        {/* Jejak Audit (Timeline) */}
        <Section title="Jejak Audit & Bukti">
          <ActivityTimeline nodes={nodes} />
        </Section>
      </div>

      <p className="mt-6">
        <Link href="/owner" className="text-sm text-muted-foreground hover:underline">← Kembali ke dashboard</Link>
      </p>
    </DashboardShell>
  );
}
