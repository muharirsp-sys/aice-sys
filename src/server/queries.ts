import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  order,
  orderItem,
  toko,
  cabang,
  user,
  produk,
  hargaCabang,
  diskonToko,
  pembayaran,
  issue,
  approval,
  pengiriman,
  dailyClosing,
  auditLog,
} from "@/db/schema";
import type { Alert, AlertLevel, OrderStatus, OrderView } from "@/lib/order-status";
import { relativeTime } from "@/lib/format";
import { ROLE_LABEL, roleNameFromId } from "@/lib/roles";

// ── Assembler OrderView ──────────────────────────────────────────────────────
type OrderRow = {
  id: number;
  tokoId: number;
  cabangId: number;
  tanggal: Date;
  status: string;
  tokoNama: string;
  tokoAlamat: string | null;
  salesNama: string;
  cabangNama: string;
};

async function assemble(rows: OrderRow[]): Promise<OrderView[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const items = await db
    .select({
      orderId: orderItem.orderId,
      produkId: orderItem.produkId,
      qty: orderItem.qty,
      hargaSatuan: orderItem.hargaSatuan,
      diskonPersen: orderItem.diskonPersenApplied,
      diskonRupiah: orderItem.diskonRupiahApplied,
      nama: produk.nama,
      sku: produk.sku,
      satuan: produk.satuan,
    })
    .from(orderItem)
    .innerJoin(produk, eq(orderItem.produkId, produk.id))
    .where(inArray(orderItem.orderId, ids));

  const byOrder = new Map<number, OrderView["items"]>();
  for (const it of items) {
    const arr = byOrder.get(it.orderId) ?? [];
    arr.push({
      produkId: it.produkId,
      nama: it.nama,
      sku: it.sku,
      satuan: it.satuan,
      qty: it.qty,
      hargaSatuan: it.hargaSatuan,
      diskonPersen: it.diskonPersen,
      diskonRupiah: it.diskonRupiah,
    });
    byOrder.set(it.orderId, arr);
  }

  return rows.map((r) => ({
    id: r.id,
    tokoId: r.tokoId,
    tokoNama: r.tokoNama,
    tokoAlamat: r.tokoAlamat ?? "-",
    salesNama: r.salesNama,
    cabangId: r.cabangId,
    cabangNama: r.cabangNama,
    tanggal: r.tanggal.toISOString(),
    status: r.status as OrderStatus,
    items: byOrder.get(r.id) ?? [],
  }));
}

function baseOrderSelect() {
  return db
    .select({
      id: order.id,
      tokoId: order.tokoId,
      cabangId: order.cabangId,
      tanggal: order.tanggal,
      status: order.status,
      tokoNama: toko.nama,
      tokoAlamat: toko.alamat,
      salesNama: user.nama,
      cabangNama: cabang.nama,
    })
    .from(order)
    .innerJoin(toko, eq(order.tokoId, toko.id))
    .innerJoin(user, eq(order.userId, user.id))
    .innerJoin(cabang, eq(order.cabangId, cabang.id));
}

// Daftar order menurut status, opsional difilter cabang (null = semua, untuk owner).
export async function listOrdersByStatus(
  statuses: OrderStatus[],
  cabangId: number | null,
): Promise<OrderView[]> {
  const conds = [inArray(order.status, statuses)];
  if (cabangId != null) conds.push(eq(order.cabangId, cabangId));
  const rows = await baseOrderSelect()
    .where(and(...conds))
    .orderBy(desc(order.tanggal), desc(order.id));
  return assemble(rows);
}

// Order terbaru di cabang (untuk panel Sales).
export async function listRecentOrders(
  cabangId: number,
  limit = 8,
): Promise<OrderView[]> {
  const rows = await baseOrderSelect()
    .where(eq(order.cabangId, cabangId))
    .orderBy(desc(order.id))
    .limit(limit);
  return assemble(rows);
}

export async function getOrderView(id: number): Promise<OrderView | null> {
  const rows = await baseOrderSelect().where(eq(order.id, id)).limit(1);
  const [v] = await assemble(rows);
  return v ?? null;
}

// Detail lengkap order: data + approval + bukti pengiriman + bukti pembayaran + issues.
export async function getOrderDetail(id: number) {
  const ov = await getOrderView(id);
  if (!ov) return null;

  const [appr] = await db
    .select({
      status: approval.status,
      approvedAt: approval.approvedAt,
      alasanTolak: approval.alasanTolak,
      adminNama: user.nama,
    })
    .from(approval)
    .innerJoin(user, eq(approval.adminUserId, user.id))
    .where(eq(approval.orderId, id))
    .orderBy(desc(approval.id))
    .limit(1);

  const [kirim] = await db
    .select({
      buktiUrl: pengiriman.buktiTerimaUrl,
      gps: pengiriman.gpsCoord,
      dikirim: pengiriman.dikirim,
      diterima: pengiriman.diterima,
      deliveryNama: user.nama,
    })
    .from(pengiriman)
    .innerJoin(user, eq(pengiriman.deliveryUserId, user.id))
    .where(eq(pengiriman.orderId, id))
    .limit(1);

  const [bayar] = await db
    .select({
      buktiUrl: pembayaran.buktiBayarUrl,
      jumlah: pembayaran.jumlah,
      metode: pembayaran.metode,
      tanggalBayar: pembayaran.tanggalBayar,
      incasoNama: user.nama,
    })
    .from(pembayaran)
    .innerJoin(user, eq(pembayaran.incasoUserId, user.id))
    .where(eq(pembayaran.orderId, id))
    .limit(1);

  const issues = await db
    .select({
      id: issue.id,
      role: issue.rolePelapor,
      deskripsi: issue.deskripsi,
      waktu: issue.waktuLapor,
      selesai: issue.status,
      pelaporNama: user.nama,
    })
    .from(issue)
    .innerJoin(user, eq(issue.pelaporUserId, user.id))
    .where(eq(issue.orderId, id))
    .orderBy(desc(issue.waktuLapor));

  return {
    order: ov,
    approval: appr ?? null,
    pengiriman: kirim ?? null,
    pembayaran: bayar ?? null,
    issues,
  };
}

// Master data untuk form Order Entry (di-scope ke cabang).
export async function masterForOrderEntry(cabangId: number) {
  const tokos = await db
    .select({ id: toko.id, nama: toko.nama })
    .from(toko)
    .where(eq(toko.cabangId, cabangId))
    .orderBy(toko.nama);

  const produks = await db
    .select({
      id: produk.id,
      nama: produk.nama,
      satuan: produk.satuan,
      harga: hargaCabang.harga,
    })
    .from(produk)
    .innerJoin(
      hargaCabang,
      and(eq(hargaCabang.produkId, produk.id), eq(hargaCabang.cabangId, cabangId)),
    )
    .orderBy(produk.nama);

  const tokoIds = tokos.map((t) => t.id);
  const diskon = tokoIds.length
    ? await db
        .select({
          tokoId: diskonToko.tokoId,
          produkId: diskonToko.produkId,
          batasPersen: diskonToko.batasDiskonPersen,
          batasRupiah: diskonToko.batasDiskonRupiah,
          defPersen: diskonToko.diskonPersen,
          defRupiah: diskonToko.diskonRupiah,
        })
        .from(diskonToko)
        .where(inArray(diskonToko.tokoId, tokoIds))
    : [];

  return { tokos, produks, diskon };
}

export async function namaCabang(id: number): Promise<string> {
  const [c] = await db.select({ nama: cabang.nama }).from(cabang).where(eq(cabang.id, id));
  return c?.nama ?? `Cabang ${id}`;
}

// ── Issue (laporan kendala/selisih) ──────────────────────────────────────────
export async function listOpenIssues(cabangId: number | null) {
  const conds = [eq(issue.status, false)]; // status=false => belum selesai
  if (cabangId != null) conds.push(eq(order.cabangId, cabangId));
  return db
    .select({
      id: issue.id,
      orderId: issue.orderId,
      role: issue.rolePelapor,
      deskripsi: issue.deskripsi,
      waktu: issue.waktuLapor,
      cabangNama: cabang.nama,
    })
    .from(issue)
    .innerJoin(order, eq(issue.orderId, order.id))
    .innerJoin(cabang, eq(order.cabangId, cabang.id))
    .where(and(...conds))
    .orderBy(desc(issue.waktuLapor));
}

// ── Dashboard Owner ──────────────────────────────────────────────────────────
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function ownerDashboard() {
  const today = startOfToday();
  const yesterday = new Date(today.getTime() - 86400000);

  const sumPayments = async (from: Date, to?: Date) => {
    const conds = [gte(pembayaran.tanggalBayar, from)];
    if (to) conds.push(lt(pembayaran.tanggalBayar, to));
    const [r] = await db
      .select({ s: sql<number>`coalesce(sum(${pembayaran.jumlah}), 0)` })
      .from(pembayaran)
      .where(and(...conds));
    return Number(r?.s ?? 0);
  };

  const pendapatanHariIni = await sumPayments(today);
  const pendapatanKemarin = await sumPayments(yesterday, today);

  // Hitung order per status & per cabang.
  const orders = await db
    .select({ status: order.status, cabangId: order.cabangId })
    .from(order);
  const aktifStatus: OrderStatus[] = [
    "pending_approval",
    "approved",
    "ready_to_ship",
    "delivered",
  ];
  const counts = {
    aktif: orders.filter((o) => aktifStatus.includes(o.status as OrderStatus)).length,
    pending: orders.filter((o) => o.status === "pending_approval").length,
    dikirim: orders.filter((o) => o.status === "delivered").length,
    lunas: orders.filter((o) => o.status === "paid").length,
  };

  const issues = await listOpenIssues(null);
  const now = Date.now();

  // Traffic Light: barang kurang (gudang) -> critical, selisih (incaso) -> warning.
  const alerts: Alert[] = issues.map((i) => ({
    id: i.id,
    level: i.role === "gudang" ? "critical" : "warning",
    title: `${i.role === "gudang" ? "Barang kurang" : "Selisih pembayaran"} — Order #${i.orderId} (${i.cabangNama})`,
    desc: i.deskripsi,
    time: relativeTime(i.waktu.toISOString(), now),
  }));

  // Ringkasan per cabang.
  const cabangs = await db.select({ id: cabang.id, nama: cabang.nama }).from(cabang);
  const ringkasan = await Promise.all(
    cabangs.map(async (c) => {
      const [rev] = await db
        .select({ s: sql<number>`coalesce(sum(${pembayaran.jumlah}), 0)` })
        .from(pembayaran)
        .innerJoin(order, eq(pembayaran.orderId, order.id))
        .where(and(eq(order.cabangId, c.id), gte(pembayaran.tanggalBayar, today)));
      const aktif = orders.filter(
        (o) => o.cabangId === c.id && aktifStatus.includes(o.status as OrderStatus),
      ).length;
      const openIssues = issues.filter((i) => i.cabangNama === c.nama).length;
      const level: AlertLevel =
        openIssues >= 2 ? "critical" : openIssues === 1 ? "warning" : "ok";
      return { cabangId: c.id, nama: c.nama, pendapatan: Number(rev?.s ?? 0), aktif, level };
    }),
  );

  return {
    pendapatanHariIni,
    pendapatanKemarin,
    counts,
    alerts,
    issues: issues.map((i) => ({
      id: i.id,
      orderId: i.orderId,
      role: i.role,
      deskripsi: i.deskripsi,
      cabangNama: i.cabangNama,
      time: relativeTime(i.waktu.toISOString(), now),
    })),
    ringkasan,
  };
}

// ── Master Data (Owner) ──────────────────────────────────────────────────────
export async function listProdukAll() {
  return db.select().from(produk).orderBy(produk.nama);
}
export async function listCabangAll() {
  return db.select().from(cabang).orderBy(cabang.id);
}
export async function listTokoAll() {
  return db
    .select({
      id: toko.id,
      nama: toko.nama,
      alamat: toko.alamat,
      noTelp: toko.noTelp,
      cabangId: toko.cabangId,
      cabangNama: cabang.nama,
    })
    .from(toko)
    .innerJoin(cabang, eq(toko.cabangId, cabang.id))
    .orderBy(toko.nama);
}
export async function listHargaAll() {
  return db
    .select({
      id: hargaCabang.id,
      produkId: hargaCabang.produkId,
      cabangId: hargaCabang.cabangId,
      harga: hargaCabang.harga,
      produkNama: produk.nama,
      cabangNama: cabang.nama,
    })
    .from(hargaCabang)
    .innerJoin(produk, eq(hargaCabang.produkId, produk.id))
    .innerJoin(cabang, eq(hargaCabang.cabangId, cabang.id))
    .orderBy(cabang.nama, produk.nama);
}
export async function listDiskonAll() {
  return db
    .select({
      id: diskonToko.id,
      tokoId: diskonToko.tokoId,
      produkId: diskonToko.produkId,
      diskonPersen: diskonToko.diskonPersen,
      diskonRupiah: diskonToko.diskonRupiah,
      batasPersen: diskonToko.batasDiskonPersen,
      batasRupiah: diskonToko.batasDiskonRupiah,
      tokoNama: toko.nama,
      produkNama: produk.nama,
    })
    .from(diskonToko)
    .innerJoin(toko, eq(diskonToko.tokoId, toko.id))
    .innerJoin(produk, eq(diskonToko.produkId, produk.id))
    .orderBy(toko.nama, produk.nama);
}

// ── Audit Trail (Owner) ──────────────────────────────────────────────────────
export async function listAudit(limit = 150) {
  return db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      table: auditLog.tableAffected,
      oldValue: auditLog.oldValue,
      newValue: auditLog.newValue,
      ts: auditLog.timestamp,
      nama: user.nama,
      roleId: user.roleId,
    })
    .from(auditLog)
    .innerJoin(user, eq(auditLog.userId, user.id))
    .orderBy(desc(auditLog.timestamp))
    .limit(limit);
}

// ── Daily Closing ─────────────────────────────────────────────────────────────
// Kunci tanggal lokal (hindari pergeseran UTC).
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function hhmm(d: Date): string {
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

// Apakah tanggal (untuk cabang) sudah dikunci? Dipakai untuk menolak mutasi (immutable).
export async function isDateLocked(cabangId: number, date: Date): Promise<boolean> {
  const [row] = await db
    .select({ locked: dailyClosing.isLocked })
    .from(dailyClosing)
    .where(and(eq(dailyClosing.cabangId, cabangId), eq(dailyClosing.tanggal, dateKey(date))))
    .limit(1);
  return !!row?.locked;
}

export const DIVISI_ORDER = [
  "sales",
  "admin_fakturist",
  "gudang",
  "delivery",
  "incaso",
] as const;

// State closing hari ini untuk sebuah cabang: status per divisi (daily_closing),
// siapa/kapan menutup & teguran (diturunkan dari audit_log).
export async function getClosingState(cabangId: number) {
  const tanggal = dateKey(new Date());
  const [row] = await db
    .select()
    .from(dailyClosing)
    .where(and(eq(dailyClosing.cabangId, cabangId), eq(dailyClosing.tanggal, tanggal)))
    .limit(1);

  const done: Record<string, boolean> = {
    sales: row?.salesDone ?? false,
    admin_fakturist: row?.adminDone ?? false,
    gudang: row?.gudangDone ?? false,
    delivery: row?.deliveryDone ?? false,
    incaso: row?.incasoDone ?? false,
  };

  // Audit hari ini untuk cabang ini -> siapa menutup & teguran.
  const today = startOfToday();
  const aud = await db
    .select({
      action: auditLog.action,
      newValue: auditLog.newValue,
      ts: auditLog.timestamp,
      nama: user.nama,
      roleId: user.roleId,
    })
    .from(auditLog)
    .innerJoin(user, eq(auditLog.userId, user.id))
    .where(and(gte(auditLog.timestamp, today), eq(user.cabangId, cabangId)));

  const who: Record<string, { nama: string; waktu: string }> = {};
  const ditegur: Record<string, string> = {};
  for (const a of aud) {
    if (a.action === "closing") {
      const rn = roleNameFromId(a.roleId);
      if (rn) who[rn] = { nama: a.nama, waktu: hhmm(a.ts) };
    } else if (a.action === "teguran" && a.newValue) {
      try {
        const t = JSON.parse(a.newValue).targetRole as string;
        if (t) ditegur[t] = hhmm(a.ts);
      } catch {}
    }
  }

  const divisi = DIVISI_ORDER.map((role) => ({
    role,
    label: ROLE_LABEL[role],
    done: done[role],
    oleh: who[role]?.nama,
    waktu: who[role]?.waktu,
    ditegur: ditegur[role],
  }));

  return { tanggal, divisi, isLocked: !!row?.isLocked };
}
