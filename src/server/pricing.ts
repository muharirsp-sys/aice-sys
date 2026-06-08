import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { hargaCabang, diskonToko, produk } from "@/db/schema";
import { subtotalItem } from "@/lib/pricing-calc";

// Harga dasar produk di sebuah cabang.
export async function getHargaSatuan(
  produkId: number,
  cabangId: number,
): Promise<number | null> {
  const [row] = await db
    .select({ harga: hargaCabang.harga })
    .from(hargaCabang)
    .where(and(eq(hargaCabang.produkId, produkId), eq(hargaCabang.cabangId, cabangId)))
    .limit(1);
  return row?.harga ?? null;
}

// Batas diskon khusus toko untuk sebuah produk. Tanpa baris -> tidak boleh diskon.
export async function getDiskonCaps(tokoId: number, produkId: number) {
  const [row] = await db
    .select({
      batasPersen: diskonToko.batasDiskonPersen,
      batasRupiah: diskonToko.batasDiskonRupiah,
      defPersen: diskonToko.diskonPersen,
      defRupiah: diskonToko.diskonRupiah,
    })
    .from(diskonToko)
    .where(and(eq(diskonToko.tokoId, tokoId), eq(diskonToko.produkId, produkId)))
    .limit(1);
  return row ?? { batasPersen: 0, batasRupiah: 0, defPersen: 0, defRupiah: 0 };
}

export type LineInput = {
  produkId: number;
  qty: number;
  diskonPersen: number;
  diskonRupiah: number;
};

export type PricedLine = {
  produkId: number;
  qty: number;
  hargaSatuan: number;
  diskonPersen: number;
  diskonRupiah: number;
  subtotal: number;
};

export type PriceResult =
  | { ok: true; lines: PricedLine[]; total: number }
  | { ok: false; error: string };

// Hitung harga otomatis + validasi batas diskon untuk seluruh baris order.
// Anti-fraud: diskon yang melebihi batas toko ditolak di server (bukan hanya UI).
export async function priceOrderLines(
  cabangId: number,
  tokoId: number,
  inputs: LineInput[],
): Promise<PriceResult> {
  if (inputs.length === 0) return { ok: false, error: "Order tidak punya item." };

  const lines: PricedLine[] = [];

  for (const inp of inputs) {
    if (inp.qty < 1) return { ok: false, error: "Qty minimal 1." };

    const harga = await getHargaSatuan(inp.produkId, cabangId);
    if (harga == null) {
      const [p] = await db
        .select({ nama: produk.nama })
        .from(produk)
        .where(eq(produk.id, inp.produkId))
        .limit(1);
      return {
        ok: false,
        error: `Harga "${p?.nama ?? "produk"}" belum diatur untuk cabang ini.`,
      };
    }

    const caps = await getDiskonCaps(tokoId, inp.produkId);
    if (inp.diskonPersen > caps.batasPersen || inp.diskonRupiah > caps.batasRupiah) {
      const [p] = await db
        .select({ nama: produk.nama })
        .from(produk)
        .where(eq(produk.id, inp.produkId))
        .limit(1);
      return {
        ok: false,
        error: `Diskon "${p?.nama ?? "produk"}" melebihi batas toko (maks ${caps.batasPersen}% / Rp${caps.batasRupiah.toLocaleString("id-ID")}/unit).`,
      };
    }
    if (inp.diskonPersen < 0 || inp.diskonRupiah < 0) {
      return { ok: false, error: "Diskon tidak boleh negatif." };
    }

    lines.push({
      produkId: inp.produkId,
      qty: inp.qty,
      hargaSatuan: harga,
      diskonPersen: inp.diskonPersen,
      diskonRupiah: inp.diskonRupiah,
      subtotal: subtotalItem({
        qty: inp.qty,
        hargaSatuan: harga,
        diskonPersen: inp.diskonPersen,
        diskonRupiah: inp.diskonRupiah,
      }),
    });
  }

  const total = lines.reduce((s, l) => s + l.subtotal, 0);
  return { ok: true, lines, total };
}
