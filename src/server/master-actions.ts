/*
Tujuan: Menangani create/update master produk, cabang, toko, harga, dan diskon.
Caller: Halaman Master Data.
Dependensi: Drizzle DB, sesi, RBAC owner/super admin, audit, dan revalidation Next.
Main Functions: upsertProduk, upsertCabang, upsertToko, upsertHarga, upsertDiskon.
Side Effects: Read/write database, audit log, dan revalidasi halaman.
*/

"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { produk, cabang, toko, hargaCabang, diskonToko } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { canAccessRole, roleNameFromId } from "@/lib/roles";
import { writeAudit } from "./audit";

type Result = { ok: true } | { ok: false; error: string };

async function ownerActor(): Promise<{ error: string } | { userId: number }> {
  const u = await getCurrentUser();
  if (!u) return { error: "Sesi berakhir." };
  if (!canAccessRole(roleNameFromId(u.roleId), "owner"))
    return { error: "Hanya Owner atau Super Admin." };
  return { userId: Number(u.id) };
}

async function audit(userId: number, table: string, op: string, data: unknown) {
  await writeAudit({ userId, action: "master_data", table, newValue: { op, ...(data as object) } });
  revalidatePath("/master");
}

export async function upsertProduk(input: {
  id?: number;
  nama: string;
  sku: string;
  satuan: string;
}): Promise<Result> {
  const a = await ownerActor();
  if ("error" in a) return { ok: false, error: a.error };
  if (!input.nama.trim() || !input.sku.trim() || !input.satuan.trim())
    return { ok: false, error: "Nama, SKU, dan satuan wajib diisi." };
  try {
    if (input.id) {
      await db.update(produk).set({ nama: input.nama.trim(), sku: input.sku.trim(), satuan: input.satuan.trim() }).where(eq(produk.id, input.id));
    } else {
      await db.insert(produk).values({ nama: input.nama.trim(), sku: input.sku.trim(), satuan: input.satuan.trim() });
    }
  } catch {
    return { ok: false, error: "Gagal — SKU mungkin sudah dipakai." };
  }
  await audit(a.userId, "produk", input.id ? "update" : "create", { sku: input.sku });
  return { ok: true };
}

export async function upsertCabang(input: {
  id?: number;
  nama: string;
  alamat: string;
}): Promise<Result> {
  const a = await ownerActor();
  if ("error" in a) return { ok: false, error: a.error };
  if (!input.nama.trim() || !input.alamat.trim())
    return { ok: false, error: "Nama dan alamat wajib diisi." };
  if (input.id) {
    await db.update(cabang).set({ nama: input.nama.trim(), alamat: input.alamat.trim() }).where(eq(cabang.id, input.id));
  } else {
    await db.insert(cabang).values({ nama: input.nama.trim(), alamat: input.alamat.trim() });
  }
  await audit(a.userId, "cabang", input.id ? "update" : "create", { nama: input.nama });
  return { ok: true };
}

export async function upsertToko(input: {
  id?: number;
  nama: string;
  alamat: string;
  noTelp: string;
  cabangId: number;
}): Promise<Result> {
  const a = await ownerActor();
  if ("error" in a) return { ok: false, error: a.error };
  if (!input.nama.trim() || !input.cabangId)
    return { ok: false, error: "Nama toko & cabang wajib." };
  const vals = {
    nama: input.nama.trim(),
    alamat: input.alamat.trim() || null,
    noTelp: input.noTelp.trim() || null,
    cabangId: input.cabangId,
  };
  if (input.id) await db.update(toko).set(vals).where(eq(toko.id, input.id));
  else await db.insert(toko).values(vals);
  await audit(a.userId, "toko", input.id ? "update" : "create", { nama: input.nama });
  return { ok: true };
}

// Harga per (produk, cabang) — upsert berdasarkan kombinasi.
export async function upsertHarga(input: {
  produkId: number;
  cabangId: number;
  harga: number;
}): Promise<Result> {
  const a = await ownerActor();
  if ("error" in a) return { ok: false, error: a.error };
  if (!input.produkId || !input.cabangId) return { ok: false, error: "Produk & cabang wajib." };
  if (!Number.isFinite(input.harga) || input.harga < 0)
    return { ok: false, error: "Harga tidak valid." };
  const [ex] = await db
    .select({ id: hargaCabang.id })
    .from(hargaCabang)
    .where(and(eq(hargaCabang.produkId, input.produkId), eq(hargaCabang.cabangId, input.cabangId)))
    .limit(1);
  if (ex) await db.update(hargaCabang).set({ harga: input.harga }).where(eq(hargaCabang.id, ex.id));
  else await db.insert(hargaCabang).values({ produkId: input.produkId, cabangId: input.cabangId, harga: input.harga });
  await audit(a.userId, "harga_cabang", ex ? "update" : "create", { produkId: input.produkId, cabangId: input.cabangId, harga: input.harga });
  return { ok: true };
}

// Diskon per (toko, produk) — upsert berdasarkan kombinasi.
export async function upsertDiskon(input: {
  tokoId: number;
  produkId: number;
  diskonPersen: number;
  diskonRupiah: number;
  batasPersen: number;
  batasRupiah: number;
}): Promise<Result> {
  const a = await ownerActor();
  if ("error" in a) return { ok: false, error: a.error };
  if (!input.tokoId || !input.produkId) return { ok: false, error: "Toko & produk wajib." };
  const nums = [input.diskonPersen, input.diskonRupiah, input.batasPersen, input.batasRupiah];
  if (nums.some((n) => !Number.isFinite(n) || n < 0))
    return { ok: false, error: "Nilai diskon/batas tidak boleh negatif." };
  if (input.diskonPersen > input.batasPersen || input.diskonRupiah > input.batasRupiah)
    return { ok: false, error: "Diskon default tidak boleh melebihi batas." };
  const vals = {
    diskonPersen: input.diskonPersen,
    diskonRupiah: input.diskonRupiah,
    batasDiskonPersen: input.batasPersen,
    batasDiskonRupiah: input.batasRupiah,
  };
  const [ex] = await db
    .select({ id: diskonToko.id })
    .from(diskonToko)
    .where(and(eq(diskonToko.tokoId, input.tokoId), eq(diskonToko.produkId, input.produkId)))
    .limit(1);
  if (ex) await db.update(diskonToko).set(vals).where(eq(diskonToko.id, ex.id));
  else await db.insert(diskonToko).values({ tokoId: input.tokoId, produkId: input.produkId, ...vals });
  await audit(a.userId, "diskon_toko", ex ? "update" : "create", { tokoId: input.tokoId, produkId: input.produkId });
  return { ok: true };
}
