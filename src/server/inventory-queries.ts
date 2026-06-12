/*
Tujuan: Query langsung DB untuk halaman Inventory (RSC — tidak melewati API).
Caller: src/app/dashboard/inventory/page.tsx (Server Component).
Dependensi: Drizzle db, schema stokCabang + kartuStok + produk + user.
*/

import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { stokCabang, kartuStok, produk, user } from "@/db/schema";
import type { PosisiStokRow, KartuStokRow } from "@/lib/inventory-types";

// Batas atas baris yang dikembalikan ke RSC — mencegah memuat seluruh tabel ke memori.
const MAX_POSISI_ROWS = 1000;
const MAX_KARTU_ROWS = 500;

/** Daftar posisi stok terkini untuk satu cabang (atau semua cabang bila null). */
export async function getPosisiStok(
  cabangId: number | null,
): Promise<PosisiStokRow[]> {
  const rows = await db
    .select({
      produkId: stokCabang.produkId,
      namaProduk: produk.nama,
      sku: produk.sku,
      satuan: produk.satuan,
      qty: stokCabang.qty,
      updatedAt: stokCabang.updatedAt,
    })
    .from(stokCabang)
    .innerJoin(produk, eq(produk.id, stokCabang.produkId))
    .where(cabangId != null ? eq(stokCabang.cabangId, cabangId) : undefined)
    .orderBy(produk.nama)
    .limit(MAX_POSISI_ROWS);

  return rows;
}

/**
 * Histori mutasi stok (kartu stok).
 * limit di-clamp ke MAX_KARTU_ROWS agar caller tidak bisa meminta data tak terbatas.
 */
export async function getKartuStok(
  cabangId: number | null,
  limit = 200,
): Promise<KartuStokRow[]> {
  const safeLimit = Math.min(limit, MAX_KARTU_ROWS);

  const rows = await db
    .select({
      id: kartuStok.id,
      createdAt: kartuStok.createdAt,
      tipe: kartuStok.tipe,
      qty: kartuStok.qty,
      qtySaldo: kartuStok.qtySaldo,
      referenceId: kartuStok.referenceId,
      keterangan: kartuStok.keterangan,
      namaProduk: produk.nama,
      namaUser: user.nama,
    })
    .from(kartuStok)
    .innerJoin(produk, eq(produk.id, kartuStok.produkId))
    .innerJoin(user, eq(user.id, kartuStok.createdBy))
    .where(cabangId != null ? eq(kartuStok.cabangId, cabangId) : undefined)
    .orderBy(desc(kartuStok.createdAt))
    .limit(safeLimit);

  return rows as KartuStokRow[];
}
