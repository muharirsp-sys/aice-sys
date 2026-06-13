"use server";

import ExcelJS from "exceljs";
import { db } from "@/db";
import { stokCabang, kartuStok, produk } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { canAccessRole, roleNameFromId } from "@/lib/roles";
import { and, eq, sql } from "drizzle-orm";

export type UploadStokRawRow = { SKU?: unknown; Qty?: unknown; Jenis?: unknown; Catatan?: unknown };

type ValidRow = { produkId: number; qty: number; jenis: "masuk" | "keluar" | "koreksi"; catatan: string | null };
type InvalidRow = { rowData: UploadStokRawRow; rowIndex: number; errorMessage: string };

export type UploadStokResult =
  | { status: "partial_success" | "all_success"; total: number; insertedCount: number; failedCount: number; errorFileBase64: string | null }
  | { status: "all_failed"; total: number; insertedCount: 0; failedCount: number; errorFileBase64: string }
  | { status: "error"; message: string };

const JENIS_VALID = ["masuk", "keluar", "koreksi"] as const;

export async function uploadStokAction(rawData: UploadStokRawRow[]): Promise<UploadStokResult> {
  const u = await getCurrentUser();
  if (!u) return { status: "error", message: "Sesi berakhir." };
  if (!canAccessRole(roleNameFromId(u.roleId), "gudang"))
    return { status: "error", message: "Hanya Gudang, Admin, Owner, atau Super Admin yang dapat melakukan bulk upload stok." };
  if (!Array.isArray(rawData) || rawData.length === 0) return { status: "error", message: "Data kosong." };
  if (rawData.length > 5_000) return { status: "error", message: "Maksimal 5.000 baris per upload." };

  const semuaProduk = await db.select({ id: produk.id, sku: produk.sku }).from(produk);
  const produkMap   = new Map(semuaProduk.map((p) => [p.sku.toLowerCase().trim(), p.id]));

  const validRows: ValidRow[] = [];
  const invalidRows: InvalidRow[] = [];

  for (let i = 0; i < rawData.length; i++) {
    const raw = rawData[i];
    const errors: string[] = [];
    const rowIndex = i + 2;

    const sku = String(raw.SKU ?? "").trim();
    if (!sku) errors.push("Kolom SKU wajib diisi");
    const produkId = produkMap.get(sku.toLowerCase());
    if (sku && !produkId) errors.push(`SKU "${sku}" tidak ditemukan`);

    const qty = Number(raw.Qty);
    if (raw.Qty === undefined || raw.Qty === null || String(raw.Qty).trim() === "") errors.push("Kolom Qty wajib diisi");
    else if (!Number.isInteger(qty) || qty <= 0) errors.push("Qty harus bilangan bulat > 0");

    const jenis = String(raw.Jenis ?? "").trim().toLowerCase();
    if (!jenis) errors.push("Kolom Jenis wajib diisi (masuk/keluar/koreksi)");
    else if (!JENIS_VALID.includes(jenis as typeof JENIS_VALID[number])) errors.push(`Jenis "${jenis}" tidak valid — gunakan: masuk, keluar, atau koreksi`);

    if (errors.length > 0) { invalidRows.push({ rowData: raw, rowIndex, errorMessage: errors.join("; ") }); continue; }
    validRows.push({ produkId: produkId!, qty, jenis: jenis as ValidRow["jenis"], catatan: String(raw.Catatan ?? "").trim() || null });
  }

  let insertedCount = 0;
  if (validRows.length > 0) {
    try {
      await db.transaction(async (tx) => {
        for (const row of validRows) {
          const [existing] = await tx.select({ id: stokCabang.id })
            .from(stokCabang)
            .where(and(eq(stokCabang.produkId, row.produkId), eq(stokCabang.cabangId, u.cabangId)))
            .limit(1);

          if (row.jenis === "koreksi") {
            if (existing) await tx.update(stokCabang).set({ stok: row.qty }).where(eq(stokCabang.id, existing.id));
            else await tx.insert(stokCabang).values({ produkId: row.produkId, cabangId: u.cabangId, stok: row.qty });
          } else {
            const delta = row.jenis === "masuk" ? row.qty : -row.qty;
            if (existing) await tx.update(stokCabang).set({ stok: sql`${stokCabang.stok} + ${delta}` }).where(eq(stokCabang.id, existing.id));
            else await tx.insert(stokCabang).values({ produkId: row.produkId, cabangId: u.cabangId, stok: Math.max(0, delta) });
          }

          await tx.insert(kartuStok).values({ produkId: row.produkId, cabangId: u.cabangId, userId: u.id, jenis: row.jenis, qty: row.qty, catatan: row.catatan, tanggal: new Date() });
          insertedCount++;
        }
      });
    } catch (err) {
      invalidRows.push({ rowData: {}, rowIndex: 0, errorMessage: err instanceof Error ? err.message : String(err) });
      insertedCount = 0;
    }
  }

  const failedCount = invalidRows.length;
  let errorFileBase64: string | null = null;

  if (failedCount > 0) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Error_Stok");
    ws.columns = [
      { header: "No. Baris",    key: "No. Baris",   width: 12 },
      { header: "SKU",          key: "SKU",          width: 20 },
      { header: "Qty",          key: "Qty",          width: 10 },
      { header: "Jenis",        key: "Jenis",        width: 14 },
      { header: "Catatan",      key: "Catatan",      width: 30 },
      { header: "Alasan_Error", key: "Alasan_Error", width: 55 },
    ];
    const hRow = ws.getRow(1);
    hRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    hRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDC2626" } };
    hRow.height = 22;
    for (const inv of invalidRows) {
      const r = ws.addRow({ "No. Baris": inv.rowIndex || "?", SKU: String(inv.rowData?.SKU ?? ""), Qty: String(inv.rowData?.Qty ?? ""), Jenis: String(inv.rowData?.Jenis ?? ""), Catatan: String(inv.rowData?.Catatan ?? ""), Alasan_Error: inv.errorMessage });
      r.getCell("Alasan_Error").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF9C3" } };
    }
    ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
    errorFileBase64 = Buffer.from(await wb.xlsx.writeBuffer()).toString("base64");
  }

  if (insertedCount === 0 && failedCount > 0)
    return { status: "all_failed", total: rawData.length, insertedCount: 0, failedCount, errorFileBase64: errorFileBase64! };
  if (failedCount === 0)
    return { status: "all_success", total: rawData.length, insertedCount, failedCount: 0, errorFileBase64: null };
  return { status: "partial_success", total: rawData.length, insertedCount, failedCount, errorFileBase64 };
}
