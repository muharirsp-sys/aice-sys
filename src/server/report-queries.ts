/*
Tujuan: Query khusus laporan — mengambil data lengkap (master & transaksi) untuk ekspor Excel.
Caller: Route handler /export/[entity]/route.ts.
Dependensi: Drizzle DB, skema penuh, RBAC cabang-scoping.
Main Functions: list* per entitas laporan. Semua menerima cabangId (null = semua, untuk owner).
Side Effects: Membaca database (read-only).
*/

import { and, desc, eq, gt, gte, inArray, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/db";
import {
  order,
  orderItem,
  toko,
  cabang,
  user,
  produk,
  pembayaran,
  pengiriman,
  approval,
  issue,
  tripKanvas,
  tripItem,
  role as roleTable,
} from "@/db/schema";
import { subtotalItem } from "@/lib/pricing-calc";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

// Filter laporan transaksi (membatasi pemindaian & menyaring hasil).
//   from/to    : rentang tanggal (to eksklusif, sudah dikonversi di route)
//   tokoId     : customer/toko tertentu (untuk laporan berbasis order)
//   produkId   : item/produk tertentu (untuk laporan berbasis item)
export type ReportFilter = {
  from?: Date;
  to?: Date;
  tokoId?: number;
  produkId?: number;
};

// Alias agar pemanggil lama tetap kompatibel.
export type DateRange = ReportFilter;

// Kondisi BETWEEN [from, to) untuk sebuah kolom timestamp. to bersifat eksklusif.
function rangeConds(col: SQLiteColumn, filter: ReportFilter) {
  const c = [];
  if (filter.from) c.push(gte(col, filter.from));
  if (filter.to) c.push(lt(col, filter.to));
  return c;
}

// ── Master: User ──────────────────────────────────────────────────────────────
export async function listUsersAll(cabangId: number | null) {
  const conds = cabangId != null ? [eq(user.cabangId, cabangId)] : [];
  return db
    .select({
      id: user.id,
      nama: user.nama,
      email: user.email,
      roleNama: roleTable.roleName,
      cabangNama: cabang.nama,
      dibuat: user.createdAt,
    })
    .from(user)
    .innerJoin(roleTable, eq(user.roleId, roleTable.id))
    .innerJoin(cabang, eq(user.cabangId, cabang.id))
    .where(and(...conds))
    .orderBy(user.id);
}

// ── Transaksi: Penjualan (level header) ─────────────────────────────────────────
export type PenjualanHeader = {
  id: number;
  tanggal: Date;
  status: string;
  tipe: string;
  tokoNama: string;
  cabangNama: string;
  salesNama: string;
  jumlahItem: number;
  total: number;
};

export type PenjualanItem = {
  orderId: number;
  tanggal: Date;
  tokoNama: string;
  cabangNama: string;
  produkNama: string;
  sku: string;
  satuan: string;
  qty: number;
  hargaSatuan: number;
  diskonPersen: number;
  diskonRupiah: number;
  subtotal: number;
};

export async function listPenjualan(
  cabangId: number | null,
  filter: ReportFilter = {},
): Promise<{ headers: PenjualanHeader[]; items: PenjualanItem[] }> {
  const conds = cabangId != null ? [eq(order.cabangId, cabangId)] : [];
  conds.push(...rangeConds(order.tanggal, filter));
  if (filter.tokoId != null) conds.push(eq(order.tokoId, filter.tokoId));
  if (filter.produkId != null) conds.push(eq(orderItem.produkId, filter.produkId));

  const rows = await db
    .select({
      orderId: order.id,
      tanggal: order.tanggal,
      status: order.status,
      tipe: order.tipe,
      tokoNama: toko.nama,
      cabangNama: cabang.nama,
      salesNama: user.nama,
      produkNama: produk.nama,
      sku: produk.sku,
      satuan: produk.satuan,
      qty: orderItem.qty,
      hargaSatuan: orderItem.hargaSatuan,
      diskonPersen: orderItem.diskonPersenApplied,
      diskonRupiah: orderItem.diskonRupiahApplied,
    })
    .from(orderItem)
    .innerJoin(order, eq(orderItem.orderId, order.id))
    .innerJoin(toko, eq(order.tokoId, toko.id))
    .innerJoin(cabang, eq(order.cabangId, cabang.id))
    .innerJoin(user, eq(order.userId, user.id))
    .innerJoin(produk, eq(orderItem.produkId, produk.id))
    .where(and(...conds))
    .orderBy(desc(order.tanggal), desc(order.id));

  const items: PenjualanItem[] = rows.map((r) => ({
    orderId: r.orderId,
    tanggal: r.tanggal,
    tokoNama: r.tokoNama,
    cabangNama: r.cabangNama,
    produkNama: r.produkNama,
    sku: r.sku,
    satuan: r.satuan,
    qty: r.qty,
    hargaSatuan: r.hargaSatuan,
    diskonPersen: r.diskonPersen,
    diskonRupiah: r.diskonRupiah,
    subtotal: subtotalItem({
      qty: r.qty,
      hargaSatuan: r.hargaSatuan,
      diskonPersen: r.diskonPersen,
      diskonRupiah: r.diskonRupiah,
    }),
  }));

  // Ringkas ke level header.
  const byOrder = new Map<number, PenjualanHeader>();
  for (const r of rows) {
    const h = byOrder.get(r.orderId);
    const sub = subtotalItem({
      qty: r.qty,
      hargaSatuan: r.hargaSatuan,
      diskonPersen: r.diskonPersen,
      diskonRupiah: r.diskonRupiah,
    });
    if (h) {
      h.jumlahItem += 1;
      h.total += sub;
    } else {
      byOrder.set(r.orderId, {
        id: r.orderId,
        tanggal: r.tanggal,
        status: r.status,
        tipe: r.tipe,
        tokoNama: r.tokoNama,
        cabangNama: r.cabangNama,
        salesNama: r.salesNama,
        jumlahItem: 1,
        total: sub,
      });
    }
  }

  const headers = Array.from(byOrder.values()).sort(
    (a, b) => b.tanggal.getTime() - a.tanggal.getTime() || b.id - a.id,
  );

  return { headers, items };
}

// ── Transaksi: Pembayaran ───────────────────────────────────────────────────────
export async function listPembayaranAll(cabangId: number | null, filter: ReportFilter = {}) {
  const conds = cabangId != null ? [eq(order.cabangId, cabangId)] : [];
  conds.push(...rangeConds(pembayaran.tanggalBayar, filter));
  if (filter.tokoId != null) conds.push(eq(order.tokoId, filter.tokoId));
  return db
    .select({
      id: pembayaran.id,
      orderId: pembayaran.orderId,
      tokoNama: toko.nama,
      cabangNama: cabang.nama,
      incasoNama: user.nama,
      tanggalBayar: pembayaran.tanggalBayar,
      jumlah: pembayaran.jumlah,
      metode: pembayaran.metode,
      buktiBayarUrl: pembayaran.buktiBayarUrl,
    })
    .from(pembayaran)
    .innerJoin(order, eq(pembayaran.orderId, order.id))
    .innerJoin(toko, eq(order.tokoId, toko.id))
    .innerJoin(cabang, eq(order.cabangId, cabang.id))
    .innerJoin(user, eq(pembayaran.incasoUserId, user.id))
    .where(and(...conds))
    .orderBy(desc(pembayaran.tanggalBayar), desc(pembayaran.id));
}

// ── Transaksi: Pengantaran (pengiriman) ─────────────────────────────────────────
export async function listPengirimanAll(cabangId: number | null, filter: ReportFilter = {}) {
  const conds = cabangId != null ? [eq(order.cabangId, cabangId)] : [];
  // Difilter berdasarkan tanggal order agar pengiriman in-progress (dikirim NULL) tetap masuk.
  conds.push(...rangeConds(order.tanggal, filter));
  if (filter.tokoId != null) conds.push(eq(order.tokoId, filter.tokoId));
  return db
    .select({
      id: pengiriman.id,
      orderId: pengiriman.orderId,
      tokoNama: toko.nama,
      tokoAlamat: toko.alamat,
      cabangNama: cabang.nama,
      deliveryNama: user.nama,
      dikirim: pengiriman.dikirim,
      diterima: pengiriman.diterima,
      buktiTerimaUrl: pengiriman.buktiTerimaUrl,
      gpsCoord: pengiriman.gpsCoord,
    })
    .from(pengiriman)
    .innerJoin(order, eq(pengiriman.orderId, order.id))
    .innerJoin(toko, eq(order.tokoId, toko.id))
    .innerJoin(cabang, eq(order.cabangId, cabang.id))
    .innerJoin(user, eq(pengiriman.deliveryUserId, user.id))
    .where(and(...conds))
    .orderBy(desc(pengiriman.id));
}

// ── Transaksi: Mutasi (Trip Kanvas + Item) ──────────────────────────────────────
export async function listTripKanvasAll(cabangId: number | null, filter: ReportFilter = {}) {
  const gudangMuat = alias(user, "gudang_muat");
  const gudangRekon = alias(user, "gudang_rekon");
  const conds = cabangId != null ? [eq(tripKanvas.cabangId, cabangId)] : [];
  conds.push(...rangeConds(tripKanvas.createdAt, filter));
  return db
    .select({
      id: tripKanvas.id,
      tujuan: tripKanvas.tujuan,
      status: tripKanvas.status,
      salesNama: user.nama,
      cabangNama: cabang.nama,
      tanggalBerangkat: tripKanvas.tanggalBerangkat,
      tanggalKembali: tripKanvas.tanggalKembali,
      gudangMuatNama: gudangMuat.nama,
      gudangRekonNama: gudangRekon.nama,
      catatanSelisih: tripKanvas.catatanSelisih,
      createdAt: tripKanvas.createdAt,
    })
    .from(tripKanvas)
    .innerJoin(user, eq(tripKanvas.salesUserId, user.id))
    .innerJoin(cabang, eq(tripKanvas.cabangId, cabang.id))
    .leftJoin(gudangMuat, eq(tripKanvas.gudangMuatUserId, gudangMuat.id))
    .leftJoin(gudangRekon, eq(tripKanvas.gudangRekonUserId, gudangRekon.id))
    .where(and(...conds))
    .orderBy(desc(tripKanvas.id));
}

export async function listTripItemAll(cabangId: number | null, filter: ReportFilter = {}) {
  const conds = cabangId != null ? [eq(tripKanvas.cabangId, cabangId)] : [];
  conds.push(...rangeConds(tripKanvas.createdAt, filter));
  if (filter.produkId != null) conds.push(eq(tripItem.produkId, filter.produkId));
  return db
    .select({
      tripId: tripItem.tripId,
      tujuan: tripKanvas.tujuan,
      status: tripKanvas.status,
      salesNama: user.nama,
      cabangNama: cabang.nama,
      produkNama: produk.nama,
      sku: produk.sku,
      satuan: produk.satuan,
      qtyMuat: tripItem.qtyMuat,
      qtyKembali: tripItem.qtyKembali,
    })
    .from(tripItem)
    .innerJoin(tripKanvas, eq(tripItem.tripId, tripKanvas.id))
    .innerJoin(user, eq(tripKanvas.salesUserId, user.id))
    .innerJoin(cabang, eq(tripKanvas.cabangId, cabang.id))
    .innerJoin(produk, eq(tripItem.produkId, produk.id))
    .where(and(...conds))
    .orderBy(desc(tripItem.tripId), produk.nama);
}

// ── Transaksi: Retur ─────────────────────────────────────────────────────────────
// Tidak ada tabel retur khusus. Retur diturunkan dari:
//   (a) barang kembali kanvas (trip_item.qty_kembali > 0), dan
//   (b) order yang ditolak (status = "rejected") beserta alasan tolaknya.
export async function listReturKanvas(cabangId: number | null, filter: ReportFilter = {}) {
  const conds = [gt(tripItem.qtyKembali, 0)];
  if (cabangId != null) conds.push(eq(tripKanvas.cabangId, cabangId));
  conds.push(...rangeConds(tripKanvas.createdAt, filter));
  if (filter.produkId != null) conds.push(eq(tripItem.produkId, filter.produkId));
  return db
    .select({
      tripId: tripItem.tripId,
      tujuan: tripKanvas.tujuan,
      salesNama: user.nama,
      cabangNama: cabang.nama,
      produkNama: produk.nama,
      sku: produk.sku,
      satuan: produk.satuan,
      qtyMuat: tripItem.qtyMuat,
      qtyKembali: tripItem.qtyKembali,
      tanggalKembali: tripKanvas.tanggalKembali,
    })
    .from(tripItem)
    .innerJoin(tripKanvas, eq(tripItem.tripId, tripKanvas.id))
    .innerJoin(user, eq(tripKanvas.salesUserId, user.id))
    .innerJoin(cabang, eq(tripKanvas.cabangId, cabang.id))
    .innerJoin(produk, eq(tripItem.produkId, produk.id))
    .where(and(...conds))
    .orderBy(desc(tripItem.tripId));
}

export async function listOrderDitolak(cabangId: number | null, filter: ReportFilter = {}) {
  const conds = [eq(order.status, "rejected")];
  if (cabangId != null) conds.push(eq(order.cabangId, cabangId));
  conds.push(...rangeConds(order.tanggal, filter));
  if (filter.tokoId != null) conds.push(eq(order.tokoId, filter.tokoId));
  return db
    .select({
      orderId: order.id,
      tanggal: order.tanggal,
      tokoNama: toko.nama,
      cabangNama: cabang.nama,
      salesNama: user.nama,
      adminNama: approval.adminUserId,
      alasanTolak: approval.alasanTolak,
      ditolakPada: approval.approvedAt,
    })
    .from(order)
    .innerJoin(toko, eq(order.tokoId, toko.id))
    .innerJoin(cabang, eq(order.cabangId, cabang.id))
    .innerJoin(user, eq(order.userId, user.id))
    .leftJoin(approval, eq(approval.orderId, order.id))
    .where(and(...conds))
    .orderBy(desc(order.id));
}

// Resolusi nama admin penolak (approval.adminUserId -> user.nama) untuk laporan retur.
export async function listOrderDitolakResolved(cabangId: number | null, filter: ReportFilter = {}) {
  const rows = await listOrderDitolak(cabangId, filter);
  const adminIds = Array.from(
    new Set(rows.map((r) => r.adminNama).filter((v): v is number => v != null)),
  );
  const adminMap = new Map<number, string>();
  if (adminIds.length) {
    const admins = await db
      .select({ id: user.id, nama: user.nama })
      .from(user)
      .where(inArray(user.id, adminIds));
    for (const a of admins) adminMap.set(a.id, a.nama);
  }
  return rows.map((r) => ({
    orderId: r.orderId,
    tanggal: r.tanggal,
    tokoNama: r.tokoNama,
    cabangNama: r.cabangNama,
    salesNama: r.salesNama,
    adminNama: r.adminNama != null ? adminMap.get(r.adminNama) ?? "-" : "-",
    alasanTolak: r.alasanTolak,
    ditolakPada: r.ditolakPada,
  }));
}

// ── Transaksi: Kendala / Selisih (issue) ─────────────────────────────────────────
export async function listIssueAll(cabangId: number | null, filter: ReportFilter = {}) {
  const conds = cabangId != null ? [eq(order.cabangId, cabangId)] : [];
  conds.push(...rangeConds(issue.waktuLapor, filter));
  if (filter.tokoId != null) conds.push(eq(order.tokoId, filter.tokoId));
  return db
    .select({
      id: issue.id,
      orderId: issue.orderId,
      rolePelapor: issue.rolePelapor,
      pelaporNama: user.nama,
      cabangNama: cabang.nama,
      deskripsi: issue.deskripsi,
      waktuLapor: issue.waktuLapor,
      status: issue.status,
    })
    .from(issue)
    .innerJoin(order, eq(issue.orderId, order.id))
    .innerJoin(cabang, eq(order.cabangId, cabang.id))
    .innerJoin(user, eq(issue.pelaporUserId, user.id))
    .where(and(...conds))
    .orderBy(desc(issue.waktuLapor));
}
