/*
Tujuan: Mutasi modul Kanvas Luar Kota — trip, muat, faktur langsung, bayar, rekonsiliasi.
Caller: Komponen halaman /sales/kanvas dan panel Muatan Kanvas di /gudang.
Dependensi: Drizzle DB, sesi/RBAC, pricing (anti-fraud), audit, dan revalidation Next.
Main Functions: createTrip, konfirmasiMuat, createKanvasOrder, recordKanvasPayment, akhiriTrip, konfirmasiRekonsiliasi.
Side Effects: Read/write database, audit log, dan revalidasi halaman.
*/

"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { hargaCabang, order, orderItem, pembayaran, toko, tripItem, tripKanvas } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { canAccessRole, roleNameFromId, type RoleName } from "@/lib/roles";
import { priceOrderLines, type LineInput } from "./pricing";
import { writeAudit } from "./audit";
import { isDateLocked } from "./queries";
import { getTripDetail } from "./kanvas-queries";

export type KanvasResult =
  | { ok: true; tripId?: number; orderId?: number; shareToken?: string }
  | { ok: false; error: string };

type Actor = { id: number; cabangId: number; name: string };

async function actorWithRole(role: RoleName): Promise<{ user: Actor } | { error: string }> {
  const u = await getCurrentUser();
  if (!u) return { error: "Sesi berakhir. Silakan login ulang." };
  if (!canAccessRole(roleNameFromId(u.roleId), role)) return { error: "Tidak berwenang." };
  return { user: { id: Number(u.id), cabangId: u.cabangId, name: u.name } };
}

function revalidateKanvas(tripId?: number) {
  revalidatePath("/sales/kanvas");
  if (tripId) revalidatePath(`/sales/kanvas/${tripId}`);
  revalidatePath("/gudang");
}

// ── Sales: ajukan trip + muatan ──────────────────────────────────────────────
export async function createTrip(input: {
  tujuan: string;
  items: { produkId: number; qtyMuat: number }[];
}): Promise<KanvasResult> {
  const a = await actorWithRole("sales");
  if ("error" in a) return { ok: false, error: a.error };

  const tujuan = input.tujuan.trim();
  if (!tujuan) return { ok: false, error: "Tujuan trip wajib diisi." };
  if (input.items.length === 0) return { ok: false, error: "Muatan minimal satu produk." };
  if (input.items.some((i) => !Number.isInteger(i.qtyMuat) || i.qtyMuat < 1))
    return { ok: false, error: "Qty muat harus bilangan bulat ≥ 1." };
  const produkIds = input.items.map((i) => i.produkId);
  if (new Set(produkIds).size !== produkIds.length)
    return { ok: false, error: "Produk muatan tidak boleh duplikat." };

  // Satu trip aktif per sales — kontrol stok van tetap sederhana & jelas.
  const [aktif] = await db
    .select({ id: tripKanvas.id })
    .from(tripKanvas)
    .where(and(eq(tripKanvas.salesUserId, a.user.id), ne(tripKanvas.status, "selesai")))
    .limit(1);
  if (aktif)
    return { ok: false, error: `Masih ada trip aktif (#${aktif.id}). Selesaikan dulu sebelum membuat trip baru.` };

  // Produk harus punya harga cabang — tanpa ini faktur tidak bisa dibuat di jalan.
  for (const it of input.items) {
    const [h] = await db
      .select({ id: hargaCabang.id })
      .from(hargaCabang)
      .where(and(eq(hargaCabang.produkId, it.produkId), eq(hargaCabang.cabangId, a.user.cabangId)))
      .limit(1);
    if (!h) return { ok: false, error: `Produk #${it.produkId} belum punya harga di cabang Anda.` };
  }

  const [created] = await db
    .insert(tripKanvas)
    .values({
      salesUserId: a.user.id,
      cabangId: a.user.cabangId,
      tujuan,
      status: "diajukan",
    })
    .returning({ id: tripKanvas.id });

  await db.insert(tripItem).values(
    input.items.map((i) => ({ tripId: created.id, produkId: i.produkId, qtyMuat: i.qtyMuat })),
  );

  await writeAudit({
    userId: a.user.id,
    action: "create_trip_kanvas",
    table: "trip_kanvas",
    newValue: { tripId: created.id, tujuan, items: input.items },
  });

  revalidateKanvas(created.id);
  return { ok: true, tripId: created.id };
}

// ── Gudang: konfirmasi muat (diajukan → berjalan) ────────────────────────────
export async function konfirmasiMuat(tripId: number): Promise<KanvasResult> {
  const a = await actorWithRole("gudang");
  if ("error" in a) return { ok: false, error: a.error };

  const [t] = await db
    .select({ id: tripKanvas.id, status: tripKanvas.status, cabangId: tripKanvas.cabangId })
    .from(tripKanvas)
    .where(eq(tripKanvas.id, tripId))
    .limit(1);
  if (!t) return { ok: false, error: "Trip tidak ditemukan." };
  if (t.cabangId !== a.user.cabangId) return { ok: false, error: "Trip di luar cabang Anda." };
  if (t.status !== "diajukan") return { ok: false, error: "Trip bukan status diajukan." };

  await db
    .update(tripKanvas)
    .set({ status: "berjalan", tanggalBerangkat: new Date(), gudangMuatUserId: a.user.id })
    .where(eq(tripKanvas.id, tripId));
  await writeAudit({
    userId: a.user.id,
    action: "konfirmasi_muat_kanvas",
    table: "trip_kanvas",
    oldValue: { status: "diajukan" },
    newValue: { tripId, status: "berjalan" },
  });

  revalidateKanvas(tripId);
  return { ok: true, tripId };
}

// ── Sales: buat faktur kanvas langsung di toko ───────────────────────────────
// Faktur terbit tanpa approval admin; kontrol pengganti: harga/diskon divalidasi
// server (priceOrderLines) dan qty dibatasi sisa muatan trip.
export async function createKanvasOrder(input: {
  tripId: number;
  tokoId: number;
  items: LineInput[];
}): Promise<KanvasResult> {
  const a = await actorWithRole("sales");
  if ("error" in a) return { ok: false, error: a.error };

  const detail = await getTripDetail(input.tripId);
  if (!detail) return { ok: false, error: "Trip tidak ditemukan." };
  if (detail.trip.salesUserId !== a.user.id)
    return { ok: false, error: "Trip ini bukan milik Anda." };
  if (detail.trip.status !== "berjalan")
    return { ok: false, error: "Trip belum/tidak sedang berjalan." };

  const [t] = await db
    .select({ id: toko.id, cabangId: toko.cabangId })
    .from(toko)
    .where(eq(toko.id, input.tokoId))
    .limit(1);
  if (!t || t.cabangId !== a.user.cabangId)
    return { ok: false, error: "Toko tidak valid untuk cabang Anda." };

  if (await isDateLocked(a.user.cabangId, new Date()))
    return { ok: false, error: "Tanggal hari ini sudah dikunci — tidak bisa input faktur." };

  // Guard stok van: qty per produk ≤ sisa muatan; produk harus ada di muatan.
  const sisa = new Map(detail.items.map((i) => [i.produkId, i.sisa]));
  const diminta = new Map<number, number>();
  for (const it of input.items)
    diminta.set(it.produkId, (diminta.get(it.produkId) ?? 0) + it.qty);
  for (const [produkId, qty] of diminta) {
    const s = sisa.get(produkId);
    if (s == null) return { ok: false, error: "Ada produk yang tidak termasuk muatan trip ini." };
    if (qty > s) {
      const nama = detail.items.find((i) => i.produkId === produkId)?.nama ?? `#${produkId}`;
      return { ok: false, error: `Qty ${nama} melebihi sisa muatan (sisa ${s}).` };
    }
  }

  // Harga otomatis + validasi batas diskon (anti-fraud, server-side).
  const priced = await priceOrderLines(a.user.cabangId, input.tokoId, input.items);
  if (!priced.ok) return { ok: false, error: priced.error };

  const shareToken = randomBytes(24).toString("base64url");
  const [created] = await db
    .insert(order)
    .values({
      tokoId: input.tokoId,
      userId: a.user.id,
      tanggal: new Date(),
      // Barang diserahkan langsung dari kendaraan → langsung "delivered";
      // melewati antrean admin/gudang/delivery secara desain.
      status: "delivered",
      cabangId: a.user.cabangId,
      tipe: "kanvas",
      tripId: input.tripId,
      shareToken,
    })
    .returning({ id: order.id });

  await db.insert(orderItem).values(
    priced.lines.map((l) => ({
      orderId: created.id,
      produkId: l.produkId,
      qty: l.qty,
      hargaSatuan: l.hargaSatuan,
      diskonPersenApplied: l.diskonPersen,
      diskonRupiahApplied: l.diskonRupiah,
    })),
  );

  await writeAudit({
    userId: a.user.id,
    action: "create_kanvas_order",
    table: "order",
    newValue: { orderId: created.id, tripId: input.tripId, total: priced.total },
  });

  revalidateKanvas(input.tripId);
  revalidatePath("/incaso");
  revalidatePath("/owner");
  return { ok: true, orderId: created.id, shareToken };
}

// ── Sales: catat pembayaran tunai di tempat (faktur kanvas) ──────────────────
export async function recordKanvasPayment(input: {
  orderId: number;
  jumlah: number;
  metode: string;
}): Promise<KanvasResult> {
  const a = await actorWithRole("sales");
  if ("error" in a) return { ok: false, error: a.error };

  if (!Number.isFinite(input.jumlah) || input.jumlah <= 0)
    return { ok: false, error: "Jumlah pembayaran tidak valid." };
  const metode = input.metode.trim() || "tunai";

  const [o] = await db
    .select({ id: order.id, status: order.status, tipe: order.tipe, userId: order.userId, cabangId: order.cabangId, tanggal: order.tanggal })
    .from(order)
    .where(eq(order.id, input.orderId))
    .limit(1);
  if (!o) return { ok: false, error: "Faktur tidak ditemukan." };
  if (o.tipe !== "kanvas") return { ok: false, error: "Bukan faktur kanvas." };
  if (o.userId !== a.user.id) return { ok: false, error: "Faktur ini bukan milik Anda." };
  if (o.status !== "delivered") return { ok: false, error: "Faktur sudah lunas / tidak bisa dibayar." };
  if (await isDateLocked(o.cabangId, o.tanggal))
    return { ok: false, error: "Tanggal terkunci — data tidak dapat diubah." };

  await db.insert(pembayaran).values({
    orderId: o.id,
    incasoUserId: a.user.id, // sales mencatat sendiri di lapangan (FK ke user, valid)
    tanggalBayar: new Date(),
    jumlah: input.jumlah,
    metode,
    buktiBayarUrl: null,
  });
  await db.update(order).set({ status: "paid" }).where(eq(order.id, o.id));
  await writeAudit({
    userId: a.user.id,
    action: "record_kanvas_payment",
    table: "pembayaran",
    newValue: { orderId: o.id, jumlah: input.jumlah, metode },
  });

  revalidateKanvas();
  revalidatePath("/incaso");
  revalidatePath("/owner");
  return { ok: true, orderId: o.id };
}

// ── Sales: akhiri trip + ajukan barang kembali (berjalan → rekonsiliasi) ─────
export async function akhiriTrip(input: {
  tripId: number;
  kembali: { produkId: number; qtyKembali: number }[];
}): Promise<KanvasResult> {
  const a = await actorWithRole("sales");
  if ("error" in a) return { ok: false, error: a.error };

  const detail = await getTripDetail(input.tripId);
  if (!detail) return { ok: false, error: "Trip tidak ditemukan." };
  if (detail.trip.salesUserId !== a.user.id)
    return { ok: false, error: "Trip ini bukan milik Anda." };
  if (detail.trip.status !== "berjalan")
    return { ok: false, error: "Trip tidak sedang berjalan." };

  const kembaliMap = new Map(input.kembali.map((k) => [k.produkId, k.qtyKembali]));
  for (const it of detail.items) {
    const qty = kembaliMap.get(it.produkId);
    if (qty == null || !Number.isInteger(qty) || qty < 0)
      return { ok: false, error: `Qty kembali untuk ${it.nama} tidak valid.` };
    if (qty > it.sisa)
      return { ok: false, error: `Qty kembali ${it.nama} (${qty}) melebihi sisa muatan (${it.sisa}).` };
  }

  for (const it of detail.items) {
    await db
      .update(tripItem)
      .set({ qtyKembali: kembaliMap.get(it.produkId)! })
      .where(and(eq(tripItem.tripId, input.tripId), eq(tripItem.produkId, it.produkId)));
  }
  await db
    .update(tripKanvas)
    .set({ status: "rekonsiliasi", tanggalKembali: new Date() })
    .where(eq(tripKanvas.id, input.tripId));
  await writeAudit({
    userId: a.user.id,
    action: "akhiri_trip_kanvas",
    table: "trip_kanvas",
    oldValue: { status: "berjalan" },
    newValue: { tripId: input.tripId, status: "rekonsiliasi", kembali: input.kembali },
  });

  revalidateKanvas(input.tripId);
  return { ok: true, tripId: input.tripId };
}

// ── Gudang: verifikasi rekonsiliasi (rekonsiliasi → selesai) ─────────────────
export async function konfirmasiRekonsiliasi(input: {
  tripId: number;
  catatanSelisih?: string;
}): Promise<KanvasResult> {
  const a = await actorWithRole("gudang");
  if ("error" in a) return { ok: false, error: a.error };

  const detail = await getTripDetail(input.tripId);
  if (!detail) return { ok: false, error: "Trip tidak ditemukan." };
  if (detail.trip.cabangId !== a.user.cabangId)
    return { ok: false, error: "Trip di luar cabang Anda." };
  if (detail.trip.status !== "rekonsiliasi")
    return { ok: false, error: "Trip belum diakhiri oleh sales." };

  // Selisih per item: muat − terjual − kembali (idealnya 0 semua).
  const selisih = detail.items
    .map((i) => ({
      produkId: i.produkId,
      nama: i.nama,
      selisih: i.qtyMuat - i.qtyTerjual - (i.qtyKembali ?? 0),
    }))
    .filter((s) => s.selisih !== 0);

  const catatan = input.catatanSelisih?.trim() ?? "";
  if (selisih.length > 0 && !catatan)
    return { ok: false, error: "Ada selisih muatan — catatan selisih wajib diisi." };

  await db
    .update(tripKanvas)
    .set({
      status: "selesai",
      gudangRekonUserId: a.user.id,
      catatanSelisih: catatan || null,
    })
    .where(eq(tripKanvas.id, input.tripId));
  await writeAudit({
    userId: a.user.id,
    action: "rekonsiliasi_trip_kanvas",
    table: "trip_kanvas",
    oldValue: { status: "rekonsiliasi" },
    newValue: { tripId: input.tripId, status: "selesai", selisih, catatan: catatan || undefined },
  });

  revalidateKanvas(input.tripId);
  revalidatePath("/owner");
  return { ok: true, tripId: input.tripId };
}
