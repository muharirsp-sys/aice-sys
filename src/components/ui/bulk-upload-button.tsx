"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, Download } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { btn, label } from "@/lib/ui";
import { getUploadTemplate, type UploadModule } from "@/server/upload-template-action";

export type AnyUploadResult =
  | { status: "partial_success" | "all_success"; total: number; insertedCount: number; failedCount: number; errorFileBase64: string | null }
  | { status: "all_failed"; total: number; insertedCount: 0; failedCount: number; errorFileBase64: string }
  | { status: "error"; message: string };

export function downloadBase64Excel(base64: string, filename: string) {
  const byteChars = atob(base64);
  const byteNums = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNums[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNums);
  const blob = new Blob([byteArray], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function parseExcelToRows(file: File): Promise<Record<string, unknown>[]> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("File Excel tidak memiliki sheet.");

  const rows: Record<string, unknown>[] = [];
  let headers: string[] = [];

  sheet.eachRow((row, rowNum) => {
    const values = (row.values as (string | number | null | undefined)[]).slice(1);
    if (rowNum === 1) {
      headers = values.map((v) => String(v ?? "").trim());
    } else {
      if (values.every((v) => v == null || String(v).trim() === "")) return;
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => { obj[h] = values[i] ?? null; });
      rows.push(obj);
    }
  });

  return rows;
}

export function DownloadTemplateButton({ module }: { module: UploadModule }) {
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      const { base64, filename } = await getUploadTemplate(module);
      downloadBase64Excel(base64, filename);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={loading}
      className={btn.outline + " shrink-0 text-xs py-1 px-2 h-auto"}
      title="Unduh template Excel kosong"
    >
      <Download className="size-3 mr-1" />
      {loading ? "Memuat..." : "Unduh Template"}
    </button>
  );
}

export function BulkUploadButton({
  module,
  dialogTitle,
  uploadAction,
  errorFilename,
}: {
  module: UploadModule;
  dialogTitle: string;
  uploadAction: (rows: Record<string, unknown>[]) => Promise<AnyUploadResult>;
  errorFilename: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<
    | { phase: "idle" }
    | { phase: "parsing" }
    | { phase: "uploading" }
    | { phase: "done"; result: AnyUploadResult }
  >({ phase: "idle" });
  const [open, setOpen] = useState(false);

  function openDialog() { setState({ phase: "idle" }); setOpen(true); }
  function closeDialog() { setOpen(false); setState({ phase: "idle" }); if (fileInputRef.current) fileInputRef.current.value = ""; }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setState({ phase: "parsing" });
      const rawData = await parseExcelToRows(file);
      setState({ phase: "uploading" });
      const result = await uploadAction(rawData);
      setState({ phase: "done", result });
      if (result.status === "all_success") {
        router.refresh();
      } else if ((result.status === "partial_success" || result.status === "all_failed") && result.failedCount > 0 && result.errorFileBase64) {
        downloadBase64Excel(result.errorFileBase64, errorFilename);
        if (result.status === "partial_success") router.refresh();
      }
    } catch (err) {
      setState({ phase: "done", result: { status: "error", message: err instanceof Error ? err.message : "Terjadi kesalahan tidak terduga." } });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const isLoading = state.phase === "parsing" || state.phase === "uploading";

  return (
    <>
      <button className={btn.outline} onClick={openDialog} title={`Upload Excel ${dialogTitle}`}>
        <Upload className="size-4" />
        <span className="hidden sm:inline">Upload Excel</span>
      </button>

      <Dialog open={open} onClose={closeDialog} title={`Bulk Upload ${dialogTitle}`}>
        <div className="mb-4 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="font-semibold text-foreground">Format kolom — unduh template untuk panduan lengkap:</p>
            <DownloadTemplateButton module={module} />
          </div>
          <p>Baris yang gagal divalidasi akan dikembalikan sebagai file Excel baru dengan kolom <strong>Alasan_Error</strong>.</p>
        </div>

        {state.phase !== "done" && (
          <div className="mb-3">
            <label className={label}>Pilih file .xlsx</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={isLoading}
              onChange={handleFile}
              className="block w-full cursor-pointer rounded-md border border-border bg-background px-3 py-2 text-sm file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-primary file:px-3 file:py-1 file:text-xs file:font-medium file:text-primary-foreground hover:file:opacity-90 disabled:opacity-50"
            />
          </div>
        )}

        {isLoading && (
          <p className="animate-pulse text-sm text-muted-foreground">
            {state.phase === "parsing" ? "Membaca file Excel..." : "Mengupload data ke server..."}
          </p>
        )}

        {state.phase === "done" && (
          <div className="space-y-3">
            {state.result.status === "error" && (
              <div className="rounded-md border border-critical/30 bg-critical/10 p-3">
                <p className="text-sm font-semibold text-critical">Upload gagal</p>
                <p className="text-sm text-critical">{state.result.message}</p>
              </div>
            )}
            {(state.result.status === "all_success" || state.result.status === "partial_success" || state.result.status === "all_failed") && (
              <div className={`rounded-md border p-3 ${state.result.status === "all_success" ? "border-success/30 bg-success/10" : "border-warning/30 bg-warning/10"}`}>
                <p className="text-sm font-semibold">
                  {state.result.status === "all_success" ? "Upload berhasil" : state.result.status === "partial_success" ? "Upload sebagian berhasil" : "Semua baris gagal"}
                </p>
                <p className="text-sm">Total: {state.result.total} | Berhasil: {state.result.insertedCount} | Gagal: {state.result.failedCount}</p>
                {state.result.failedCount > 0 && <p className="mt-1 text-xs text-muted-foreground">File error sudah diunduh otomatis.</p>}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button className={btn.outline} onClick={closeDialog}>Tutup</button>
              {state.result.status !== "all_success" && (
                <button className={btn.primary} onClick={() => { setState({ phase: "idle" }); if (fileInputRef.current) fileInputRef.current.value = ""; }}>Upload Lagi</button>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
