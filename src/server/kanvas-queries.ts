/*
Tujuan: Query modul Kanvas Luar Kota — trip, muatan, sisa stok van, dan faktur trip.
Caller: Halaman /sales/kanvas, panel gudang, dan route PDF publik /f/[token].
Dependensi: Drizzle DB, skema trip/order, dan view-model order.
Main Functions: listTripsForSales, listTripsForGudang, getTripDetail, getOrderByShareToken.
Side Effects: Membaca database.
*/

import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { order, orderItem, produk, toko, tripItem, tripKanvas, user } from "@/db/schema";
import { totalItems } from "@/lib/pricing-calc";
import type { OrderStatus, OrderView } from "@/lib/order-status";
import { getOrderView } from "./queries";

export type TripStatus = "diajukan" | "berjalan" | "rekonsiliasi" | "selesai";

export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  diajukan: "Diajukan",
  berjalan: "Berjalan",
  rekonsiliasi: "Rekonsiliasi",
  selesai: "Selesai",
};

// Item trip + qty terjual (dihitung dari order kanvas trip ini, exclude rejected).
export type TripItemView = {
  produkId: number;
  nama: string;
  sku: string;
  satuan: string;
  qtyMuat: number;
  qtyTerjual: number;
  qtyKembali: number | null;
  sisa: number; // qtyMuat - qtyTerjual
};

export type TripRow = {
  id: number;
  tujuan: string;
  status: TripStatus;
  salesNama: string;
  tanggalBerangkat: Date | null;
  tanggalKembali: Date | null;
  createdAt: Date;
  totalItemMuat: number;
};

function baseTripSelect() {
  return db
    .select({
      id: tripKanvas.id,
      tujuan: tripKanvas.tujuan,
      status: tripKanvas.status,
      salesNama: user.nama,
      tanggalBerangkat: tripKanvas.tanggalBerangkat,
      tanggalKembali: tripKanvas.tanggalKembali,
      createdAt: tripKanvas.createdAt,
      totalItemMuat: sql<number>`coalesce((select sum(${tripItem.qtyMuat}) from ${tripItem} where ${tripItem.tripId} = ${tripKanvas.id}), 0)`,
    })
    .from(tripKanvas)
    .innerJoin(user, eq(tripKanvas.salesUserId, user.id));
}

type RawTripRow = Omit<TripRow, "status" | "totalItemMuat"> & {
  status: string;
  totalItemMuat: number;
};

function asTripRows(rows: RawTripRow[]): TripRow[] {
  return rows.map((r) => ({ ...r, status: r.status as TripStatus, totalItemMuat: Number(r.totalItemMuat) }));
}

// Semua trip milik seorang sales, terbaru dulu.
export async function listTripsForSales(salesUserId: number): Promise<TripRow[]> {
  const rows = await baseTripSelect()
    .where(eq(tripKanvas.salesUserId, salesUserId))
    .orderBy(desc(tripKanvas.id));
  return asTripRows(rows);
}

// Trip aktif (belum selesai) milik sales — dipakai untuk membatasi satu trip aktif.
export async function getActiveTripForSales(salesUserId: number): Promise<TripRow | null> {
  const rows = await baseTripSelect()
    .where(and(eq(tripKanvas.salesUserId, salesUserId), ne(tripKanvas.status, "selesai")))
    .orderBy(desc(tripKanvas.id))
    .limit(1);
  return asTripRows(rows)[0] ?? null;
}

// Antrean kerja gudang: trip menunggu konfirmasi muat / verifikasi rekonsiliasi.
export async function listTripsForGudang(cabangId: number): Promise<TripRow[]> {
  const rows = await baseTripSelect()
    .where(
      and(
        eq(tripKanvas.cabangId, cabangId),
        inArray(tripKanvas.status, ["diajukan", "rekonsiliasi"]),
      ),
    )
    .orderBy(desc(tripKanvas.id));
  return asTripRows(rows);
}

// Faktur ringkas milik sebuah trip (untuk daftar di halaman trip).
export type TripFakturRow = {
  id: number;
  tokoNama: string;
  tokoNoTelp: string | null;
  tanggal: Date;
  status: OrderStatus;
  shareToken: string | null;
  total: number;
};

// Qty terjual per produk untuk sebuah trip (order kanvas, exclude rejected).
async function terjualPerProduk(tripId: number): Promise<Map<number, number>> {
  const rows = await db
    .select({
      produkId: orderItem.produkId,
      qty: sql<number>`sum(${orderItem.qty})`,
    })
    .from(orderItem)
    .innerJoin(order, eq(orderItem.orderId, order.id))
    .where(and(eq(order.tripId, tripId), ne(order.status, "rejected")))
    .groupBy(orderItem.produkId);
  return new Map(rows.map((r) => [r.produkId, Number(r.qty)]));
}

export async function getTripDetail(tripId: number): Promise<{
  trip: TripRow & { salesUserId: number; cabangId: number; catatanSelisih: string | null };
  items: TripItemView[];
  fakturs: TripFakturRow[];
} | null> {
  const [t] = await db
    .select({
      id: tripKanvas.id,
      tujuan: tripKanvas.tujuan,
      status: tripKanvas.status,
      salesUserId: tripKanvas.salesUserId,
      cabangId: tripKanvas.cabangId,
      tanggalBerangkat: tripKanvas.tanggalBerangkat,
      tanggalKembali: tripKanvas.tanggalKembali,
      catatanSelisih: tripKanvas.catatanSelisih,
      createdAt: tripKanvas.createdAt,
      salesNama: user.nama,
    })
    .from(tripKanvas)
    .innerJoin(user, eq(tripKanvas.salesUserId, user.id))
    .where(eq(tripKanvas.id, tripId))
    .limit(1);
  if (!t) return null;

  const [rawItems, terjual] = await Promise.all([
    db
      .select({
        produkId: tripItem.produkId,
        qtyMuat: tripItem.qtyMuat,
        qtyKembali: tripItem.qtyKembali,
        nama: produk.nama,
        sku: produk.sku,
        satuan: produk.satuan,
      })
      .from(tripItem)
      .innerJoin(produk, eq(tripItem.produkId, produk.id))
      .where(eq(tripItem.tripId, tripId))
      .orderBy(produk.nama),
    terjualPerProduk(tripId),
  ]);

  const items: TripItemView[] = rawItems.map((i) => {
    const qtyTerjual = terjual.get(i.produkId) ?? 0;
    return { ...i, qtyTerjual, sisa: i.qtyMuat - qtyTerjual };
  });

  const fakturRows = await db
    .select({
      id: order.id,
      tokoNama: toko.nama,
      tokoNoTelp: toko.noTelp,
      tanggal: order.tanggal,
      status: order.status,
      shareToken: order.shareToken,
    })
    .from(order)
    .innerJoin(toko, eq(order.tokoId, toko.id))
    .where(eq(order.tripId, tripId))
    .orderBy(desc(order.id));

  const fakturIds = fakturRows.map((f) => f.id);
  const itemRows = fakturIds.length
    ? await db
        .select({
          orderId: orderItem.orderId,
          qty: orderItem.qty,
          hargaSatuan: orderItem.hargaSatuan,
          diskonPersen: orderItem.diskonPersenApplied,
          diskonRupiah: orderItem.diskonRupiahApplied,
        })
        .from(orderItem)
        .where(inArray(orderItem.orderId, fakturIds))
    : [];
  const totalByOrder = new Map<number, number>();
  for (const id of fakturIds) {
    totalByOrder.set(
      id,
      totalItems(itemRows.filter((r) => r.orderId === id)),
    );
  }

  return {
    trip: {
      id: t.id,
      tujuan: t.tujuan,
      status: t.status as TripStatus,
      salesNama: t.salesNama,
      salesUserId: t.salesUserId,
      cabangId: t.cabangId,
      tanggalBerangkat: t.tanggalBerangkat,
      tanggalKembali: t.tanggalKembali,
      catatanSelisih: t.catatanSelisih,
      createdAt: t.createdAt,
      totalItemMuat: items.reduce((s, i) => s + i.qtyMuat, 0),
    },
    items,
    fakturs: fakturRows.map((f) => ({
      ...f,
      status: f.status as OrderStatus,
      total: totalByOrder.get(f.id) ?? 0,
    })),
  };
}

// Toko cabang + noTelp (untuk dropdown faktur kanvas & tombol kirim WA).
export async function listTokoForKanvas(cabangId: number) {
  return db
    .select({ id: toko.id, nama: toko.nama, noTelp: toko.noTelp })
    .from(toko)
    .where(eq(toko.cabangId, cabangId))
    .orderBy(toko.nama);
}

// Lookup order kanvas via token publik (untuk route PDF tanpa login).
export async function getOrderByShareToken(token: string): Promise<OrderView | null> {
  if (!token || token.length < 16) return null;
  const [row] = await db
    .select({ id: order.id })
    .from(order)
    .where(eq(order.shareToken, token))
    .limit(1);
  if (!row) return null;
  return getOrderView(row.id);
}
