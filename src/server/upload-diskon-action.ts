"use server";

import ExcelJS from "exceljs";
import { db } from "@/db";
import { diskonToko, produk, toko } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { canAccessRole, roleNameFromId } from "@/lib/roles";
import { and, eq } from "drizzle-orm";

export type UploadDiskonRawRow = {
  NamaToko?: unknown; SKU?: unknown;
  DiskonPersen?: unknown; DiskonRupiah?: unknown;
  BatasPersen?: unknown; BatasRupiah?: unknown;
};

type ValidRow = { tokoId: number; produkId: number; diskonPersen: number; diskonRupiah: number; batasDiskonPersen: number; batasDiskonRupiah: number };
type InvalidRow = { rowData: UploadDiskonRawRow; rowIndex: number; errorMessage: string };

export type UploadDiskonResult =
  | { status: "partial_success" | "all_success"; total: number; insertedCount: number; failedCount: number; errorFileBase64: string | null }
  | { status: "all_failed"; total: number; insertedCount: 0; failedCount: number; errorFileBase64: string }
  | { status: "error"; message: string };

function parseNonNeg(v: unknown, label: string): { val: number } | { err: string } {
  if (v === undefined || v === null || String(v).trim() === "") return { err: `Kolom ${label} wajib diisi` };
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return { err: `${label} harus angka ≥ 0` };
  return { val: n };
}

export async function uploadDiskonAction(rawData: UploadDiskonRawRow[]): Promise<UploadDiskonResult> {
  const u = await getCurrentUser();
  if (!u) return { status: "error", message: "Sesi berakhir." };
  if (!canAccessRole(roleNameFromId(u.roleId), "owner"))
    return { status: "error", message: "Hanya Owner atau Super Admin yang dapat melakukan bulk upload." };
  if (!Array.isArray(rawData) || rawData.length === 0) return { status: "error", message: "Data kosong." };
  if (rawData.length > 5_000) return { status: "error", message: "Maksimal 5.000 baris per upload." };

  const semuaToko = await db.select({ id: toko.id, nama: toko.nama }).from(toko);
  const tokoMap = new Map(semuaToko.map((t) => [t.nama.toLowerCase().trim(), t.id]));

  const semuaProduk = await db.select({ id: produk.id, sku: produk.sku }).from(produk);
  const produkMap = new Map(semuaProduk.map((p) => [p.sku.toLowerCase().trim(), p.id]));

  const validRows: ValidRow[] = [];
  const invalidRows: InvalidRow[] = [];

  for (let i = 0; i < rawData.length; i++) {
    const raw = rawData[i];
    const errors: string[] = [];
    const rowIndex = i + 2;

    const namaToko = String(raw.NamaToko ?? "").trim();
    if (!namaToko) errors.push("Kolom NamaToko wajib diisi");
    const tokoId = tokoMap.get(namaToko.toLowerCase());
    if (namaToko && !tokoId) errors.push(`Toko "${namaToko}" tidak ditemukan`);

    const sku = String(raw.SKU ?? "").trim();
    if (!sku) errors.push("Kolom SKU wajib diisi");
    const produkId = produkMap.get(sku.toLowerCase());
    if (sku && !produkId) errors.push(`SKU "${sku}" tidak ditemukan`);

    const dp = parseNonNeg(raw.DiskonPersen, "DiskonPersen");
    const dr = parseNonNeg(raw.DiskonRupiah, "DiskonRupiah");
    const bp = parseNonNeg(raw.BatasPersen, "BatasPersen");
    const br = parseNonNeg(raw.BatasRupiah, "BatasRupiah");
    if ("err" in dp) errors.push(dp.err);
    if ("err" in dr) errors.push(dr.err);
    if ("err" in bp) errors.push(bp.err);
    if ("err" in br) errors.push(br.err);

    if (errors.length === 0) {
      const dpv = (dp as { val: number }).val, drv = (dr as { val: number }).val;
      const bpv = (bp as { val: number }).val, brv = (br as { val: number }).val;
      if (dpv > bpv) errors.push("DiskonPersen tidak boleh melebihi BatasPersen");
      if (drv > brv) errors.push("DiskonRupiah tidak boleh melebihi BatasRupiah");
    }

    if (errors.length > 0) { invalidRows.push({ rowData: raw, rowIndex, errorMessage: errors.join("; ") }); continue; }
    validRows.push({ tokoId: tokoId!, produkId: produkId!, diskonPersen: (dp as { val: number }).val, diskonRupiah: (dr as { val: number }).val, batasDiskonPersen: (bp as { val: number }).val, batasDiskonRupiah: (br as { val: number }).val });
  }

  let insertedCount = 0;
  if (validRows.length > 0) {
    try {
      await db.transaction(async (tx) => {
        for (const row of validRows) {
          const [ex] = await tx.select({ id: diskonToko.id }).from(diskonToko)
            .where(and(eq(diskonToko.tokoId, row.tokoId), eq(diskonToko.produkId, row.produkId))).limit(1);
          if (ex) await tx.update(diskonToko).set({ diskonPersen: row.diskonPersen, diskonRupiah: row.diskonRupiah, batasDiskonPersen: row.batasDiskonPersen, batasDiskonRupiah: row.batasDiskonRupiah }).where(eq(diskonToko.id, ex.id));
          else await tx.insert(diskonToko).values(row);
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
    const ws = wb.addWorksheet("Error_Diskon");
    ws.columns = [
      { header: "No. Baris",    key: "No. Baris",    width: 12 },
      { header: "NamaToko",     key: "NamaToko",     width: 28 },
      { header: "SKU",          key: "SKU",           width: 18 },
      { header: "DiskonPersen", key: "DiskonPersen",  width: 14 },
      { header: "DiskonRupiah", key: "DiskonRupiah",  width: 14 },
      { header: "BatasPersen",  key: "BatasPersen",   width: 14 },
      { header: "BatasRupiah",  key: "BatasRupiah",   width: 14 },
      { header: "Alasan_Error", key: "Alasan_Error",  width: 55 },
    ];
    const hRow = ws.getRow(1);
    hRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    hRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDC2626" } };
    hRow.height = 22;
    for (const inv of invalidRows) {
      const r = ws.addRow({ "No. Baris": inv.rowIndex || "?", NamaToko: String(inv.rowData?.NamaToko ?? ""), SKU: String(inv.rowData?.SKU ?? ""), DiskonPersen: String(inv.rowData?.DiskonPersen ?? ""), DiskonRupiah: String(inv.rowData?.DiskonRupiah ?? ""), BatasPersen: String(inv.rowData?.BatasPersen ?? ""), BatasRupiah: String(inv.rowData?.BatasRupiah ?? ""), Alasan_Error: inv.errorMessage });
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
