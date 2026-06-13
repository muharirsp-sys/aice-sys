/*
Tujuan: Helper pembuat workbook Excel (.xlsx) yang konsisten untuk semua laporan.
Caller: src/server/reports.ts (registry laporan) via route handler /export/[entity].
Dependensi: exceljs (di-load Node saat runtime; lihat serverExternalPackages).
Main Functions: buildWorkbook, xlsxDate, xlsxDateTime.
Side Effects: Tidak ada (murni membangun buffer di memori).
*/

import ExcelJS from "exceljs";

// Definisi kolom generik: header + cara ekstraksi nilai dari satu baris data.
export type ColumnDef<T> = {
  header: string;
  width?: number;
  numFmt?: string; // mis. "#,##0" untuk rupiah
  value: (row: T) => string | number | Date | boolean | null | undefined;
};

export type Sheet<T> = {
  name: string;
  columns: ColumnDef<T>[];
  rows: T[];
};

// Nama sheet Excel maksimal 31 karakter & tidak boleh mengandung : \ / ? * [ ].
function sanitizeSheetName(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, " ").slice(0, 31) || "Sheet";
}

// Cegah formula/CSV injection: nilai string yang diawali = + - @ (atau tab/CR)
// bisa dieksekusi sebagai formula oleh aplikasi spreadsheet. Awali tanda kutip.
function sanitizeCell(
  v: string | number | Date | boolean | null | undefined,
): string | number | Date | boolean | "" {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(v)) return "'" + v;
  return v;
}

// Bangun satu workbook berisi satu/lebih sheet. Mengembalikan Buffer .xlsx.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildWorkbook(sheets: Sheet<any>[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Aice — Konsol Operasi";
  wb.created = new Date();

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sanitizeSheetName(sheet.name));

    // Header.
    ws.addRow(sheet.columns.map((c) => c.header));
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E293B" },
    };
    headerRow.alignment = { vertical: "middle" };
    headerRow.height = 20;

    // Data.
    for (const r of sheet.rows) {
      ws.addRow(
        sheet.columns.map((c) => sanitizeCell(c.value(r))),
      );
    }

    // Lebar kolom + format angka.
    sheet.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = c.width ?? 18;
      if (c.numFmt) col.numFmt = c.numFmt;
    });

    // Bekukan header + filter otomatis untuk kemudahan analisis.
    ws.views = [{ state: "frozen", ySplit: 1 }];
    if (sheet.rows.length > 0) {
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: sheet.columns.length },
      };
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// Format tanggal+waktu id-ID untuk sel Excel (string agar konsisten lintas zona).
export function xlsxDateTime(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Format tanggal saja id-ID.
export function xlsxDate(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Boolean -> label Indonesia.
export function yaTidak(v: boolean | null | undefined): string {
  return v ? "Ya" : "Tidak";
}

// ── Upload Template ──────────────────────────────────────────────────────────

export type TemplateCol = {
  header: string;
  width?: number;
  example: string | number;
  required?: boolean; // default true — kolom wajib ditandai " *" di header
};

// Bangun file .xlsx kosong: header + 1 baris contoh (hijau muda).
// Server actions memanggil ini lalu mengembalikan base64 ke client untuk diunduh.
export async function buildUploadTemplate(
  sheetName: string,
  cols: TemplateCol[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Aice — Konsol Operasi";
  wb.created = new Date();

  const ws = wb.addWorksheet(sanitizeSheetName(sheetName));

  ws.addRow(cols.map((c) => (c.required === false ? c.header : `${c.header} *`)));
  const hRow = ws.getRow(1);
  hRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  hRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
  hRow.alignment = { vertical: "middle", horizontal: "center" };
  hRow.height = 22;

  ws.addRow(cols.map((c) => c.example));
  const eRow = ws.getRow(2);
  eRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
  eRow.font = { italic: true, color: { argb: "FF065F46" } };
  eRow.alignment = { vertical: "top", wrapText: true };
  eRow.height = 18;

  cols.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width ?? 20;
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
