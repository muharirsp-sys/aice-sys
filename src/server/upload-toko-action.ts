"use server";

import ExcelJS from "exceljs";
import { db } from "@/db";
import { toko, cabang } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { canAccessRole, roleNameFromId } from "@/lib/roles";

export type UploadTokoRawRow = {
  Nama?: unknown;
  NamaCabang?: unknown;
  Alamat?: unknown;
  NoTelp?: unknown;
};

type ValidRow = { nama: string; cabangId: number; alamat: string | null; noTelp: string | null };
type InvalidRow = { rowData: UploadTokoRawRow; rowIndex: number; errorMessage: string };

export type UploadTokoResult =
  | { status: "partial_success" | "all_success"; total: number; insertedCount: number; failedCount: number; errorFileBase64: string | null }
  | { status: "all_failed"; total: number; insertedCount: 0; failedCount: number; errorFileBase64: string }
  | { status: "error"; message: string };

export async function uploadTokoAction(rawData: UploadTokoRawRow[]): Promise<UploadTokoResult> {
  const u = await getCurrentUser();
  if (!u) return { status: "error", message: "Sesi berakhir. Silakan login ulang." };
  if (!canAccessRole(roleNameFromId(u.roleId), "owner"))
    return { status: "error", message: "Hanya Owner atau Super Admin yang dapat melakukan bulk upload." };
  if (!Array.isArray(rawData) || rawData.length === 0)
    return { status: "error", message: "Data kosong." };
  if (rawData.length > 5_000)
    return { status: "error", message: "Maksimal 5.000 baris per upload." };

  const semuaCabang = await db.select({ id: cabang.id, nama: cabang.nama }).from(cabang);
  const cabangMap = new Map(semuaCabang.map((c) => [c.nama.toLowerCase().trim(), c.id]));

  const validRows: ValidRow[] = [];
  const invalidRows: InvalidRow[] = [];

  for (let i = 0; i < rawData.length; i++) {
    const raw = rawData[i];
    const errors: string[] = [];
    const rowIndex = i + 2;

    const nama = String(raw.Nama ?? "").trim();
    if (!nama) errors.push("Kolom Nama wajib diisi");
    else if (nama.length > 200) errors.push("Nama maksimal 200 karakter");

    const namaCabangRaw = String(raw.NamaCabang ?? "").trim();
    if (!namaCabangRaw) errors.push("Kolom NamaCabang wajib diisi");
    const cabangId = cabangMap.get(namaCabangRaw.toLowerCase());
    if (namaCabangRaw && !cabangId) errors.push(`Cabang "${namaCabangRaw}" tidak ditemukan`);

    if (errors.length > 0) { invalidRows.push({ rowData: raw, rowIndex, errorMessage: errors.join("; ") }); continue; }

    validRows.push({ nama, cabangId: cabangId!, alamat: String(raw.Alamat ?? "").trim() || null, noTelp: String(raw.NoTelp ?? "").trim() || null });
  }

  let insertedCount = 0;
  if (validRows.length > 0) {
    try {
      await db.insert(toko).values(validRows);
      insertedCount = validRows.length;
    } catch (err) {
      invalidRows.push({ rowData: {}, rowIndex: 0, errorMessage: err instanceof Error ? err.message : String(err) });
    }
  }

  const failedCount = invalidRows.length;
  let errorFileBase64: string | null = null;

  if (failedCount > 0) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Error_Toko");
    ws.columns = [
      { header: "No. Baris",   key: "No. Baris",   width: 12 },
      { header: "Nama",        key: "Nama",         width: 30 },
      { header: "NamaCabang",  key: "NamaCabang",   width: 25 },
      { header: "Alamat",      key: "Alamat",        width: 35 },
      { header: "NoTelp",      key: "NoTelp",        width: 20 },
      { header: "Alasan_Error",key: "Alasan_Error",  width: 55 },
    ];
    const hRow = ws.getRow(1);
    hRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    hRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDC2626" } };
    hRow.height = 22;
    for (const inv of invalidRows) {
      const r = ws.addRow({ "No. Baris": inv.rowIndex || "?", Nama: String(inv.rowData?.Nama ?? ""), NamaCabang: String(inv.rowData?.NamaCabang ?? ""), Alamat: String(inv.rowData?.Alamat ?? ""), NoTelp: String(inv.rowData?.NoTelp ?? ""), Alasan_Error: inv.errorMessage });
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
