/*
Tujuan: Mutasi stok gudang secara atomik (inventory + kartu stok / stock_movement).
Caller: Server Actions dari UI Inventory dan modul lain (order delivery, penerimaan PO).
Dependensi: Drizzle DB transaction, sesi Better Auth, schema stokCabang + kartuStok.
Main Functions: mutateStock.
Side Effects: Upsert stok + insert kartu_stok dalam satu transaksi; revalidate path inventory.
*/

"use server";

import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { stokCabang, kartuStok } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";

// SALDO_AWAL hanya boleh di-insert dari master-actions (pembuatan produk baru).
// mutateStock hanya menerima tiga tipe operasional.
export type MovementType = "IN" | "OUT" | "ADJUSTMENT";

export type MutateStockResult =
  | { ok: true; inventoryId: number; balanceAfter: number }
  | { ok: false; error: string };

/**
 * Mutasi stok secara atomik.
 *
 * @param productId   - ID produk (FK ke produk.id)
 * @param branchId    - ID cabang (FK ke cabang.id)
 * @param qtyChange   - Delta stok: positif untuk IN, negatif untuk OUT, signed untuk ADJUSTMENT
 * @param movementType - "IN" | "OUT" | "ADJUSTMENT"
 * @param referenceId - No. faktur / PO / referensi dokumen sumber (opsional)
 *
 * Hukum Atomik: stok diupdate DAN kartu_stok di-insert dalam db.transaction().
 * Negative Lock: OUT yang mengakibatkan qty < 0 akan throw Error → rollback otomatis.
 */
export async function mutateStock(
  productId: number,
  branchId: number,
  qtyChange: number,
  movementType: MovementType,
  referenceId?: string,
): Promise<MutateStockResult> {
  const u = await getCurrentUser();
  if (!u) return { ok: false, error: "Sesi berakhir. Silakan login ulang." };
  const userId = Number(u.id);

  if (!Number.isFinite(qtyChange) || qtyChange === 0) {
    return { ok: false, error: "qtyChange tidak valid atau nol." };
  }

  if ((movementType as string) === "SALDO_AWAL") {
    return { ok: false, error: "SALDO_AWAL tidak boleh dipanggil via mutateStock. Gunakan master-actions." };
  }

  try {
    const result = await db.transaction(async (tx) => {
      // 1. Cari atau buat baris inventory (stok_cabang) untuk produk + cabang ini.
      const [existing] = await tx
        .select()
        .from(stokCabang)
        .where(
          and(
            eq(stokCabang.produkId, productId),
            eq(stokCabang.cabangId, branchId),
          ),
        )
        .limit(1);

      const currentQty = existing?.qty ?? 0;
      const newQty = currentQty + qtyChange;

      // Negative Lock: OUT dan ADJUSTMENT negatif tidak boleh membuat stok negatif.
      // Tanpa guard ini ADJUSTMENT besar akan lolos dan menabrak chk_stok_non_negative
      // di DB level, menghasilkan unhandled DB error daripada pesan yang informatif.
      if ((movementType === "OUT" || movementType === "ADJUSTMENT") && newQty < 0) {
        throw new Error(
          `Stok tidak mencukupi. Stok saat ini: ${currentQty}, diminta: ${Math.abs(qtyChange)}.`,
        );
      }

      let inventoryId: number;

      if (!existing) {
        // Insert baris inventory baru.
        const [inserted] = await tx
          .insert(stokCabang)
          .values({
            produkId: productId,
            cabangId: branchId,
            qty: newQty,
            updatedAt: new Date(),
          })
          .returning({ id: stokCabang.id });
        inventoryId = inserted.id;
      } else {
        // Update stok yang sudah ada.
        await tx
          .update(stokCabang)
          .set({ qty: newQty, updatedAt: new Date() })
          .where(eq(stokCabang.id, existing.id));
        inventoryId = existing.id;
      }

      // 2. Insert baris kartu_stok (stock_movement).
      await tx.insert(kartuStok).values({
        produkId: productId,
        cabangId: branchId,
        tipe: movementType,
        qty: Math.abs(qtyChange),   // nilai absolut
        qtySaldo: newQty,           // balanceAfter
        referenceId: referenceId ?? null,
        createdBy: userId,
        createdAt: new Date(),
      });

      return { inventoryId, balanceAfter: newQty };
    });

    revalidatePath("/dashboard/inventory");
    return { ok: true, ...result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan sistem.";
    return { ok: false, error: message };
  }
}
