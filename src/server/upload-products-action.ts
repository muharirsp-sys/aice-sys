/*
Tujuan: Bulk upload produk dengan partial-success semantics.
Alur: Validasi manual per-baris → insert valid rows → generate error Excel (exceljs) → return Base64.
Caller: BulkUploadProduk client component di master-client.tsx.
Dependensi: Drizzle DB, exceljs, sesi owner/super-admin.
Kolom Excel input: Nama | SKU | Satuan | SatuanTambahan (opsional, pipe-separated)
*/

"use server";

import ExcelJS from "exceljs";
import { db } from "@/db";
import { produk, produkSatuan } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { canAccessRole, roleNameFromId } from "@/lib/roles";

// ── Types ────────────────────────────────────────────────────────────────────
export type UploadProductsRawRow = {
  Nama?: unknown;
  SKU?: unknown;
  Satuan?: unknown;
  SatuanTambahan?: unknown;
};

type ValidRow = {
  Nama: string;
  SKU: string;
  Satuan: string;
  SatuanTambahan: string | null;
};

type InvalidRow = {
  rowData: UploadProductsRawRow;
  rowIndex: number; // nomor baris di Excel (2-based, baris 1 = header)
  errorMessage: string;
};

export type UploadProductsResult =
  | {
      status: "partial_success" | "all_success";
      total: number;
      insertedCount: number;
      failedCount: number;
      errorFileBase64: string | null;
    }
  | {
      status: "all_failed";
      total: number;
      insertedCount: 0;
      failedCount: number;
      errorFileBase64: string;
    }
  | { status: "error"; message: string };

// ── Validasi manual (konsisten dengan pola master-actions.ts) ─────────────────
function validateRow(
  raw: UploadProductsRawRow,
  rowIndex: number
): { valid: true; data: ValidRow } | { valid: false; row: InvalidRow } {
  const errors: string[] = [];

  // Nama
  const nama = typeof raw.Nama === "string" ? raw.Nama.trim() : String(raw.Nama ?? "").trim();
  if (!nama) {
    errors.push("Kolom Nama wajib diisi");
  } else if (nama.length > 200) {
    errors.push("Nama produk maksimal 200 karakter");
  }

  // SKU
  const sku = typeof raw.SKU === "string" ? raw.SKU.trim() : String(raw.SKU ?? "").trim();
  if (!sku) {
    errors.push("Kolom SKU wajib diisi");
  } else if (sku.length > 100) {
    errors.push("SKU maksimal 100 karakter");
  } else if (!/^[\w\-\.]+$/.test(sku)) {
    errors.push("SKU hanya boleh berisi huruf, angka, tanda hubung (-), dan titik (.)");
  }

  // Satuan
  const satuan = typeof raw.Satuan === "string" ? raw.Satuan.trim() : String(raw.Satuan ?? "").trim();
  if (!satuan) {
    errors.push("Kolom Satuan wajib diisi");
  } else if (satuan.length > 50) {
    errors.push("Satuan maksimal 50 karakter");
  }

  // SatuanTambahan — opsional
  const satuanTambahan =
    raw.SatuanTambahan != null && String(raw.SatuanTambahan).trim().length > 0
      ? String(raw.SatuanTambahan).trim()
      : null;

  if (errors.length > 0) {
    return {
      valid: false,
      row: { rowData: raw, rowIndex, errorMessage: errors.join("; ") },
    };
  }

  return { valid: true, data: { Nama: nama, SKU: sku, Satuan: satuan, SatuanTambahan: satuanTambahan } };
}

// ── Main Server Action ────────────────────────────────────────────────────────
export async function uploadProductsAction(
  rawData: UploadProductsRawRow[]
): Promise<UploadProductsResult> {
  // ── Auth guard
  const u = await getCurrentUser();
  if (!u) return { status: "error", message: "Sesi berakhir. Silakan login ulang." };
  if (!canAccessRole(roleNameFromId(u.roleId), "owner"))
    return { status: "error", message: "Hanya Owner atau Super Admin yang dapat melakukan bulk upload." };

  if (!Array.isArray(rawData) || rawData.length === 0)
    return { status: "error", message: "Data kosong. Tidak ada baris untuk diproses." };

  const MAX_ROWS = 5_000;
  if (rawData.length > MAX_ROWS)
    return { status: "error", message: `Terlalu banyak baris. Maksimal ${MAX_ROWS.toLocaleString()} baris per upload.` };

  const total = rawData.length;

  // ── 1. Data Segregation ─────────────────────────────────────────────────
  const validRows: ValidRow[] = [];
  const invalidRows: InvalidRow[] = [];

  for (let i = 0; i < rawData.length; i++) {
    const result = validateRow(rawData[i], i + 2); // +2: row 1 = header Excel
    if (result.valid) {
      validRows.push(result.data);
    } else {
      invalidRows.push(result.row);
    }
  }

  // ── 2. Bulk Insert Valid Rows ────────────────────────────────────────────
  let insertedCount = 0;

  if (validRows.length > 0) {
    // Track which valid-row index is currently being processed so the catch
    // block can report the correct Excel row number instead of 0.
    let currentValidIdx = 0;

    try {
      // Transaction: SQLite tidak support multi-row returning, loop di dalam tx.
      await db.transaction(async (tx) => {
        for (currentValidIdx = 0; currentValidIdx < validRows.length; currentValidIdx++) {
          const row = validRows[currentValidIdx];
          const satuanDefault = row.Satuan;

          const [created] = await tx
            .insert(produk)
            .values({ nama: row.Nama, sku: row.SKU, satuan: satuanDefault })
            .returning({ id: produk.id });

          // Satuan default
          await tx.insert(produkSatuan).values({
            produkId: created.id,
            satuan: satuanDefault,
            isDefault: true,
          });

          // Satuan tambahan (pipe-separated)
          if (row.SatuanTambahan) {
            const extras = row.SatuanTambahan
              .split("|")
              .map((s) => s.trim())
              .filter((s) => s.length > 0 && s.toLowerCase() !== satuanDefault.toLowerCase());

            for (const extra of extras) {
              await tx.insert(produkSatuan).values({
                produkId: created.id,
                satuan: extra,
                isDefault: false,
              });
            }
          }

          insertedCount++;
        }
      });
    } catch (err) {
      // DB-level error: identify the failing row precisely.
      // All validRows are rolled back by the transaction, so report the
      // specific row that triggered the error using currentValidIdx.
      const isUniqueViolation = err instanceof Error && err.message.includes("UNIQUE");
      const failingRow = validRows[currentValidIdx];
      // Row index in the original Excel: validRows[i] came from rawData at
      // position (i + number_of_invalid_rows_before_it). We stored the Excel
      // row index on each InvalidRow during segregation, but for valid rows we
      // only have the 0-based validRows index. Reconstruct a best-effort Excel
      // row number: currentValidIdx + 2 + invalidRows.length (header = row 1).
      const estimatedExcelRow = currentValidIdx + 2;

      invalidRows.push({
        rowData: failingRow as unknown as UploadProductsRawRow,
        rowIndex: estimatedExcelRow,
        errorMessage: isUniqueViolation
          ? `SKU "${failingRow?.SKU}" sudah terdaftar di database (duplikat unik)`
          : `Gagal menyimpan ke database: ${err instanceof Error ? err.message : String(err)}`,
      });

      insertedCount = 0;
    }
  }

  const failedCount = invalidRows.length;

  // ── 3. Error Excel Generation via exceljs ──────────────────────────────
  let errorFileBase64: string | null = null;

  if (failedCount > 0) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Aice System";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Error_Produk");

    // Definisi kolom — Alasan_Error di paling kanan (KRITIS per spec)
    sheet.columns = [
      { header: "No. Baris",       key: "No. Baris",       width: 12 },
      { header: "Nama",            key: "Nama",            width: 30 },
      { header: "SKU",             key: "SKU",             width: 20 },
      { header: "Satuan",          key: "Satuan",          width: 15 },
      { header: "SatuanTambahan",  key: "SatuanTambahan",  width: 25 },
      { header: "Alasan_Error",    key: "Alasan_Error",    width: 65 }, // paling kanan
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font   = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill   = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDC2626" } }; // merah
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = { bottom: { style: "thin", color: { argb: "FF991B1B" } } };
    });
    headerRow.height = 22;

    // Isi baris error
    for (const inv of invalidRows) {
      const dataRow = sheet.addRow({
        "No. Baris":      inv.rowIndex || "?",
        Nama:             String(inv.rowData?.Nama          ?? ""),
        SKU:              String(inv.rowData?.SKU           ?? ""),
        Satuan:           String(inv.rowData?.Satuan        ?? ""),
        SatuanTambahan:   String(inv.rowData?.SatuanTambahan ?? ""),
        // KRITIS: isi pesan error spesifik per baris
        Alasan_Error:     inv.errorMessage,
      });

      // Highlight sel Alasan_Error
      const errCell = dataRow.getCell("Alasan_Error");
      errCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF9C3" } }; // kuning
      errCell.font = { color: { argb: "FF92400E" } }; // coklat tua
      dataRow.alignment = { wrapText: true, vertical: "top" };
      dataRow.height = 18;
    }

    // Freeze header
    sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

    // ── Konversi workbook ke Base64 string
    const buffer = await workbook.xlsx.writeBuffer();
    errorFileBase64 = Buffer.from(buffer).toString("base64");
  }

  // ── 4. Structured response ────────────────────────────────────────────────
  if (insertedCount === 0 && failedCount > 0) {
    return { status: "all_failed",       total, insertedCount: 0, failedCount, errorFileBase64: errorFileBase64! };
  }
  if (failedCount === 0) {
    return { status: "all_success",      total, insertedCount,   failedCount: 0, errorFileBase64: null };
  }
  return   { status: "partial_success", total, insertedCount,   failedCount,   errorFileBase64 };
}
