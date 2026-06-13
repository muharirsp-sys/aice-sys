"use server";

import ExcelJS from "exceljs";
import { db } from "@/db";
import { hargaCabang, produk, cabang } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { canAccessRole, roleNameFromId } from "@/lib/roles";
import { and, eq } from "drizzle-orm";

export type UploadHargaRawRow = { SKU?: unknown; NamaCabang?: unknown; Harga?: unknown };
type ValidRow = { produkId: number; cabangId: number; harga: number };
type InvalidRow = { rowData: UploadHargaRawRow; rowIndex: number; errorMessage: string };

export type UploadHargaResult =
  | { status: "partial_success" | "all_success"; total: number; insertedCount: number; failedCount: number; errorFileBase64: string | null }
  | { status: "all_failed"; total: number; insertedCount: 0; failedCount: number; errorFileBase64: string }
  | { status: "error"; message: string };

export async function uploadHargaAction(rawData: UploadHargaRawRow[]): Promise<UploadHargaResult> {
  const u = await getCurrentUser();
  if (!u) return { status: "error", message: "Sesi berakhir." };
  if (!canAccessRole(roleNameFromId(u.roleId), "owner"))
    return { status: "error", message: "Hanya Owner atau Super Admin yang dapat melakukan bulk upload." };
  if (!Array.isArray(rawData) || rawData.length === 0) return { status: "error", message: "Data kosong." };
  if (rawData.length > 5_000) return { status: "error", message: "Maksimal 5.000 baris per upload." };

  const semuaProduk = await db.select({ id: produk.id, sku: produk.sku }).from(produk);
  const produkMap = new Map(semuaProduk.map((p) => [p.sku.toLowerCase().trim(), p.id]));

  const semuaCabang = await db.select({ id: cabang.id, nama: cabang.nama }).from(cabang);
  const cabangMap = new Map(semuaCabang.map((c) => [c.nama.toLowerCase().trim(), c.id]));

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

    const namaCabang = String(raw.NamaCabang ?? "").trim();
    if (!namaCabang) errors.push("Kolom NamaCabang wajib diisi");
    const cabangId = cabangMap.get(namaCabang.toLowerCase());
    if (namaCabang && !cabangId) errors.push(`Cabang "${namaCabang}" tidak ditemukan`);

    const hargaRaw = Number(raw.Harga);
    if (raw.Harga === undefined || raw.Harga === null || String(raw.Harga).trim() === "") errors.push("Kolom Harga wajib diisi");
    else if (!Number.isFinite(hargaRaw) || hargaRaw < 0) errors.push("Harga harus angka positif");

    if (errors.length > 0) { invalidRows.push({ rowData: raw, rowIndex, errorMessage: errors.join("; ") }); continue; }
    validRows.push({ produkId: produkId!, cabangId: cabangId!, harga: hargaRaw });
  }

  let insertedCount = 0;
  if (validRows.length > 0) {
    try {
      await db.transaction(async (tx) => {
        for (const row of validRows) {
          const [ex] = await tx.select({ id: hargaCabang.id }).from(hargaCabang)
            .where(and(eq(hargaCabang.produkId, row.produkId), eq(hargaCabang.cabangId, row.cabangId))).limit(1);
          if (ex) await tx.update(hargaCabang).set({ harga: row.harga }).where(eq(hargaCabang.id, ex.id));
          else await tx.insert(hargaCabang).values(row);
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
    const ws = wb.addWorksheet("Error_Harga");
    ws.columns = [
      { header: "No. Baris",    key: "No. Baris",   width: 12 },
      { header: "SKU",          key: "SKU",          width: 20 },
      { header: "NamaCabang",   key: "NamaCabang",   width: 25 },
      { header: "Harga",        key: "Harga",        width: 18 },
      { header: "Alasan_Error", key: "Alasan_Error", width: 55 },
    ];
    const hRow = ws.getRow(1);
    hRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    hRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDC2626" } };
    hRow.height = 22;
    for (const inv of invalidRows) {
      const r = ws.addRow({ "No. Baris": inv.rowIndex || "?", SKU: String(inv.rowData?.SKU ?? ""), NamaCabang: String(inv.rowData?.NamaCabang ?? ""), Harga: String(inv.rowData?.Harga ?? ""), Alasan_Error: inv.errorMessage });
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
