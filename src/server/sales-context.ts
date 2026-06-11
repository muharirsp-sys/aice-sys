/*
Tujuan: Menyediakan konteks toko untuk Order Entry (histori pembelian, reorder, produk
        favorit) — mendukung cross/up-sell ala SFA FMCG tanpa keluar dari scope PRD.
Caller: OrderEntryForm (client) saat sales memilih toko.
Dependensi: Drizzle DB, sesi, RBAC.
Main Functions: getTokoContext.
Side Effects: Membaca database (read-only).
*/

"use server";

import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { order, orderItem, toko, produk } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { canAccessRole, roleNameFromId } from "@/lib/roles";

export type ReorderItem = { produkId: number; qty: number };

export type TokoContext = {
  tokoId: number;
  alamat: string | null;
  noTelp: string | null;
  totalOrder: number;
  lastOrder: { id: number; tanggal: string; items: ReorderItem[] } | null;
  topProduk: { produkId: number; nama: string; satuan: string; totalQty: number }[];
};

export type TokoContextResult =
  | { ok: true; ctx: TokoContext }
  | { ok: false; error: string };

// Histori order yang dihitung mengabaikan order yang ditolak.
export async function getTokoContext(tokoId: number): Promise<TokoContextResult> {
  const u = await getCurrentUser();
  if (!u) return { ok: false, error: "Sesi berakhir. Silakan login ulang." };
  if (!canAccessRole(roleNameFromId(u.roleId), "sales")) {
    return { ok: false, error: "Tidak berwenang." };
  }

  const [t] = await db
    .select({ id: toko.id, alamat: toko.alamat, noTelp: toko.noTelp, cabangId: toko.cabangId })
    .from(toko)
    .where(eq(toko.id, tokoId))
    .limit(1);
  if (!t) return { ok: false, error: "Toko tidak ditemukan." };

  // Scope cabang: sales hanya boleh melihat konteks toko di cabangnya (anti kebocoran lintas-cabang).
  const isSuper = canAccessRole(roleNameFromId(u.roleId), "owner");
  if (!isSuper) {
    // Tolak jika cabang user/toko tidak konkret atau berbeda (null === null tidak boleh lolos).
    if (u.cabangId == null || t.cabangId == null || t.cabangId !== u.cabangId) {
      return { ok: false, error: "Toko di luar cabang Anda." };
    }
  }

  const notRejected = and(eq(order.tokoId, tokoId), ne(order.status, "rejected"));

  // Tiga query independen dijalankan paralel (count, order terakhir, produk favorit).
  const [cntRows, lastRows, top] = await Promise.all([
    db.select({ c: sql<number>`count(*)` }).from(order).where(notRejected),
    db
      .select({ id: order.id, tanggal: order.tanggal })
      .from(order)
      .where(notRejected)
      .orderBy(desc(order.id))
      .limit(1),
    db
      .select({
        produkId: orderItem.produkId,
        nama: produk.nama,
        satuan: produk.satuan,
        totalQty: sql<number>`sum(${orderItem.qty})`,
      })
      .from(orderItem)
      .innerJoin(order, eq(orderItem.orderId, order.id))
      .innerJoin(produk, eq(orderItem.produkId, produk.id))
      .where(notRejected)
      .groupBy(orderItem.produkId, produk.nama, produk.satuan)
      .orderBy(desc(sql`sum(${orderItem.qty})`))
      .limit(5),
  ]);

  const cnt = cntRows[0];
  const last = lastRows[0];

  // Item order terakhir bergantung pada `last`, jadi diambil setelahnya.
  let lastOrder: TokoContext["lastOrder"] = null;
  if (last) {
    const items = await db
      .select({ produkId: orderItem.produkId, qty: orderItem.qty })
      .from(orderItem)
      .where(eq(orderItem.orderId, last.id));
    lastOrder = { id: last.id, tanggal: last.tanggal.toISOString(), items };
  }

  return {
    ok: true,
    ctx: {
      tokoId,
      alamat: t.alamat,
      noTelp: t.noTelp,
      totalOrder: Number(cnt?.c ?? 0),
      lastOrder,
      topProduk: top.map((r) => ({
        produkId: r.produkId,
        nama: r.nama,
        satuan: r.satuan,
        totalQty: Number(r.totalQty),
      })),
    },
  };
}
