"use client";

import { useState, useTransition, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Search, X, Trash2, Upload, Download } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { btn, input, label } from "@/lib/ui";
import { rupiah } from "@/lib/format";
import {
  upsertProduk,
  upsertCabang,
  upsertToko,
  upsertHarga,
  upsertDiskon,
} from "@/server/master-actions";
import { createUser, updateUser, deleteUser } from "@/server/user-actions";
import {
  uploadProductsAction,
  type UploadProductsRawRow,
  type UploadProductsResult,
} from "@/server/upload-products-action";
import { getUploadTemplate, type UploadModule } from "@/server/upload-template-action";
import { uploadTokoAction, type UploadTokoRawRow } from "@/server/upload-toko-action";
import { uploadHargaAction, type UploadHargaRawRow } from "@/server/upload-harga-action";
import { uploadDiskonAction, type UploadDiskonRawRow } from "@/server/upload-diskon-action";

const PAGE_SIZE = 20;

type Result = { ok: boolean; error?: string };

function useSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  function run(fn: () => Promise<Result>, onOk: () => void) {
    setErr(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setErr(r.error ?? "Gagal.");
      else {
        onOk();
        router.refresh();
      }
    });
  }
  return { pending, err, setErr, run };
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function TableHeader({
  title,
  onAdd,
  search,
  onSearch,
  searchPlaceholder = "Cari...",
  filterSlot,
}: {
  title: string;
  onAdd: () => void;
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder?: string;
  filterSlot?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="font-display text-base font-semibold">{title}</h2>
      <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
        {/* Search */}
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className={`${input} pl-8 pr-8`}
          />
          {search && (
            <button
              onClick={() => onSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Hapus pencarian"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        {/* Optional filter slot */}
        {filterSlot}
        {/* Add button */}
        <button className={btn.primary} onClick={onAdd}>
          <Plus className="size-4" /> Tambah
        </button>
      </div>
    </div>
  );
}

function Pagination({
  page,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onChange: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
      <span>
        {start}–{end} dari {total} data
      </span>
      <div className="flex gap-1">
        <button
          className={btn.outline}
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Halaman sebelumnya"
        >
          ‹
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter(
            (p) =>
              p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1)
          )
          .reduce<(number | "…")[]>((acc, p, i, arr) => {
            if (i > 0 && (arr[i - 1] as number) < p - 1) acc.push("…");
            acc.push(p);
            return acc;
          }, [])
          .map((p, i) =>
            p === "…" ? (
              <span key={`ellipsis-${i}`} className="px-1">
                …
              </span>
            ) : (
              <button
                key={p}
                className={`${p === page ? btn.primary : btn.outline} min-w-[2rem]`}
                onClick={() => onChange(p as number)}
                aria-current={p === page ? "page" : undefined}
              >
                {p}
              </button>
            )
          )}
        <button
          className={btn.outline}
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          aria-label="Halaman berikutnya"
        >
          ›
        </button>
      </div>
    </div>
  );
}

function Field({
  label: l,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <label className={label}>{l}</label>
      {children}
    </div>
  );
}

// ── Bulk Upload Helper ───────────────────────────────────────────────────────

/**
 * Trigger unduhan file Excel dari Base64 string di sisi klien.
 * Membuat anchor element sementara, men-set href ke data URI, lalu klik programatik.
 */
function downloadBase64Excel(base64: string, filename: string) {
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

/**
 * Parse file Excel (.xlsx) di browser menggunakan ExcelJS (sudah ada di bundle).
 * Mengembalikan array of plain objects, key = nilai header baris pertama.
 */
async function parseExcelFile(file: File): Promise<UploadProductsRawRow[]> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("File Excel tidak memiliki sheet.");

  const rows: UploadProductsRawRow[] = [];
  let headers: string[] = [];

  sheet.eachRow((row, rowNum) => {
    const values = (row.values as (string | number | null | undefined)[]).slice(1); // index 0 kosong di ExcelJS
    if (rowNum === 1) {
      headers = values.map((v) => String(v ?? "").trim());
    } else {
      // Skip baris kosong total
      if (values.every((v) => v == null || String(v).trim() === "")) return;
      const obj: UploadProductsRawRow = {};
      headers.forEach((h, i) => {
        (obj as Record<string, unknown>)[h] = values[i] ?? null;
      });
      rows.push(obj);
    }
  });

  return rows;
}

// Tombol unduh template Excel kosong untuk modul upload tertentu.
function DownloadTemplateButton({ module }: { module: Parameters<typeof getUploadTemplate>[0] }) {
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

// Generic bulk upload button — dipakai oleh semua modul selain Produk.
// Caller cukup pass module (untuk template) + uploadAction + label dialog.
type AnyUploadResult =
  | { status: "partial_success" | "all_success"; total: number; insertedCount: number; failedCount: number; errorFileBase64: string | null }
  | { status: "all_failed"; total: number; insertedCount: 0; failedCount: number; errorFileBase64: string }
  | { status: "error"; message: string };

function BulkUploadButton({
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
  const [state, setState] = useState<{ phase: "idle" } | { phase: "parsing" } | { phase: "uploading" } | { phase: "done"; result: AnyUploadResult }>({ phase: "idle" });
  const [open, setOpen] = useState(false);

  function openDialog() { setState({ phase: "idle" }); setOpen(true); }
  function closeDialog() { setOpen(false); setState({ phase: "idle" }); if (fileInputRef.current) fileInputRef.current.value = ""; }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setState({ phase: "parsing" });
      const rawData = await parseExcelFile(file) as Record<string, unknown>[];
      setState({ phase: "uploading" });
      const result = await uploadAction(rawData);
      setState({ phase: "done", result });
      if (result.status === "all_success") { router.refresh(); }
      else if ((result.status === "partial_success" || result.status === "all_failed") && result.failedCount > 0 && result.errorFileBase64) {
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
            <input ref={fileInputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={isLoading} onChange={handleFile}
              className="block w-full cursor-pointer rounded-md border border-border bg-background px-3 py-2 text-sm file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-primary file:px-3 file:py-1 file:text-xs file:font-medium file:text-primary-foreground hover:file:opacity-90 disabled:opacity-50" />
          </div>
        )}

        {isLoading && <p className="text-sm text-muted-foreground animate-pulse">{state.phase === "parsing" ? "Membaca file Excel..." : "Mengupload data ke server..."}</p>}

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
                <p className="text-sm font-semibold">{state.result.status === "all_success" ? "Upload berhasil" : state.result.status === "partial_success" ? "Upload sebagian berhasil" : "Semua baris gagal"}</p>
                <p className="text-sm">Total: {state.result.total} | Berhasil: {state.result.insertedCount} | Gagal: {state.result.failedCount}</p>
                {state.result.failedCount > 0 && <p className="text-xs mt-1 text-muted-foreground">File error sudah diunduh otomatis.</p>}
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

type BulkUploadState =
  | { phase: "idle" }
  | { phase: "parsing" }
  | { phase: "uploading" }
  | { phase: "done"; result: UploadProductsResult };

function BulkUploadProduk() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<BulkUploadState>({ phase: "idle" });
  const [open, setOpen] = useState(false);

  function openDialog() {
    setState({ phase: "idle" });
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    setState({ phase: "idle" });
    // Reset file input agar file yang sama bisa dipilih lagi
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setState({ phase: "parsing" });
      const rawData = await parseExcelFile(file);

      setState({ phase: "uploading" });
      const result = await uploadProductsAction(rawData);

      setState({ phase: "done", result });

      if (result.status === "all_success") {
        router.refresh();
      } else if (
        (result.status === "partial_success" || result.status === "all_failed") &&
        result.failedCount > 0 &&
        result.errorFileBase64
      ) {
        // Auto-trigger download file error jika ada baris gagal
        downloadBase64Excel(
          result.errorFileBase64,
          `error-produk-${new Date().toISOString().slice(0, 10)}.xlsx`
        );
        if (result.status === "partial_success") router.refresh();
      }
    } catch (err) {
      setState({
        phase: "done",
        result: {
          status: "error",
          message: err instanceof Error ? err.message : "Terjadi kesalahan tidak terduga.",
        },
      });
    } finally {
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const isLoading = state.phase === "parsing" || state.phase === "uploading";

  return (
    <>
      {/* Trigger button — muncul di toolbar MasterProdukPanel */}
      <button
        className={btn.outline}
        onClick={openDialog}
        aria-label="Bulk upload produk dari Excel"
        title="Upload Excel"
      >
        <Upload className="size-4" />
        <span className="hidden sm:inline">Upload Excel</span>
      </button>

      <Dialog open={open} onClose={closeDialog} title="Bulk Upload Produk">
        {/* Petunjuk format + tombol unduh template */}
        <div className="mb-4 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="font-semibold text-foreground">Format kolom Excel (baris pertama = header):</p>
            <DownloadTemplateButton module="produk" />
          </div>
          <ul className="list-disc pl-4 space-y-0.5">
            <li><strong>Nama *</strong> — nama produk</li>
            <li><strong>SKU *</strong> — kode unik, huruf/angka/tanda hubung/titik</li>
            <li><strong>Satuan *</strong> — satuan default, misal: <em>pcs</em>, <em>dus</em></li>
            <li><strong>SatuanTambahan</strong> — satuan ekstra dipisah <em>|</em>, misal: <em>lusin|gross</em> (opsional)</li>
          </ul>
          <p className="mt-2">Baris yang gagal akan dikembalikan sebagai file Excel baru dengan kolom <strong>Alasan_Error</strong>.</p>
        </div>

        {/* File input */}
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
              aria-label="Pilih file Excel untuk bulk upload produk"
            />
          </div>
        )}

        {/* Status loading */}
        {isLoading && (
          <p className="text-sm text-muted-foreground animate-pulse">
            {state.phase === "parsing" ? "Membaca file Excel..." : "Mengupload data ke server..."}
          </p>
        )}

        {/* Hasil upload */}
        {state.phase === "done" && (
          <div className="space-y-3">
            {state.result.status === "error" && (
              <div className="rounded-md border border-critical/30 bg-critical/10 p-3">
                <p className="text-sm font-semibold text-critical">Upload gagal</p>
                <p className="text-sm text-critical">{state.result.message}</p>
              </div>
            )}

            {state.result.status === "all_success" && (
              <div className="rounded-md border border-green-200 bg-green-50 p-3">
                <p className="text-sm font-semibold text-green-800">Semua data berhasil disimpan</p>
                <p className="text-sm text-green-700">
                  {state.result.insertedCount} dari {state.result.total} produk berhasil diinsert.
                </p>
              </div>
            )}

            {(state.result.status === "partial_success" || state.result.status === "all_failed") && (
              <div
                className={`rounded-md border p-3 ${
                  state.result.status === "all_failed"
                    ? "border-critical/30 bg-critical/10"
                    : "border-yellow-200 bg-yellow-50"
                }`}
              >
                <p
                  className={`text-sm font-semibold ${
                    state.result.status === "all_failed" ? "text-critical" : "text-yellow-800"
                  }`}
                >
                  {state.result.status === "all_failed" ? "Semua baris gagal" : "Upload sebagian berhasil"}
                </p>
                <ul className="mt-1 text-sm space-y-0.5">
                  <li>
                    Berhasil diinsert:{" "}
                    <strong className="tabular">{state.result.insertedCount}</strong> baris
                  </li>
                  <li>
                    Gagal / ditolak:{" "}
                    <strong className="tabular text-critical">{state.result.failedCount}</strong> baris
                  </li>
                  <li>Total dikirim: <strong className="tabular">{state.result.total}</strong> baris</li>
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">
                  File Excel berisi baris-baris yang gagal beserta kolom{" "}
                  <strong>Alasan_Error</strong> sudah otomatis diunduh.
                </p>
                {/* Tombol unduh ulang jika user menutup dialog sebelum download selesai */}
                {state.result.errorFileBase64 && (
                  <button
                    className={`${btn.outline} mt-2 text-xs`}
                    onClick={() =>
                      downloadBase64Excel(
                        (state.result as { errorFileBase64: string }).errorFileBase64,
                        `error-produk-${new Date().toISOString().slice(0, 10)}.xlsx`
                      )
                    }
                  >
                    Unduh ulang file error
                  </button>
                )}
              </div>
            )}

            <button className={btn.outline} onClick={closeDialog}>
              Tutup
            </button>
          </div>
        )}
      </Dialog>
    </>
  );
}

// ── Produk ────────────────────────────────────────────────────────────────────
type Produk = { id: number; nama: string; sku: string; satuan: string };
type StokEntry = { produkId: number; cabangId: number; qty: number; cabangNama: string };
type ProdukSatuanRow = { id: number; produkId: number; satuan: string; isDefault: boolean };
type SatuanDraft = { satuan: string; isDefault: boolean };

function MasterProdukPanel({
  rows,
  cabangs,
  stok,
  produkSatuans,
}: {
  rows: Produk[];
  cabangs: { id: number; nama: string }[];
  stok: StokEntry[];
  produkSatuans: ProdukSatuanRow[];
}) {
  const { pending, err, setErr, run } = useSave();
  const [edit, setEdit] = useState<Produk | null>(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ nama: "", sku: "" });
  const [satuans, setSatuans] = useState<SatuanDraft[]>([{ satuan: "", isDefault: true }]);
  // initialStocks[cabangId] = qty — only used on CREATE
  const [initialStocks, setInitialStocks] = useState<Record<number, number>>({});
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Stok per produk keyed by produkId → array of { cabangNama, qty }
  const stokByProduk = useMemo(() => {
    const map = new Map<number, { cabangNama: string; qty: number }[]>();
    for (const s of stok) {
      const arr = map.get(s.produkId) ?? [];
      arr.push({ cabangNama: s.cabangNama, qty: s.qty });
      map.set(s.produkId, arr);
    }
    return map;
  }, [stok]);

  const satuansByProduk = useMemo(() => {
    const map = new Map<number, ProdukSatuanRow[]>();
    for (const s of produkSatuans) {
      const arr = map.get(s.produkId) ?? [];
      arr.push(s);
      map.set(s.produkId, arr);
    }
    return map;
  }, [produkSatuans]);

  function openForm(p?: Produk) {
    setErr(null);
    setEdit(p ?? null);
    setF(p ? { nama: p.nama, sku: p.sku } : { nama: "", sku: "" });
    if (p) {
      const existing = satuansByProduk.get(p.id);
      setSatuans(
        existing?.length
          ? existing.map((s) => ({ satuan: s.satuan, isDefault: s.isDefault }))
          : [{ satuan: p.satuan, isDefault: true }],
      );
    } else {
      setSatuans([{ satuan: "", isDefault: true }]);
      const defaults: Record<number, number> = {};
      for (const c of cabangs) defaults[c.id] = 0;
      setInitialStocks(defaults);
    }
    setOpen(true);
  }

  function addSatuan() {
    setSatuans((prev) => [...prev, { satuan: "", isDefault: false }]);
  }

  function updateSatuan(i: number, patch: Partial<SatuanDraft>) {
    setSatuans((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function setDefaultSatuan(i: number) {
    setSatuans((prev) => prev.map((s, idx) => ({ ...s, isDefault: idx === i })));
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.nama.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q) ||
        r.satuan.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleSearch(v: string) {
    setSearch(v);
    setPage(1);
  }

  const cols: Column<Produk>[] = [
    { header: "Nama", cell: (r) => r.nama },
    { header: "SKU", cell: (r) => <span className="tabular">{r.sku}</span> },
    {
      header: "Satuan",
      cell: (r) => {
        const ss = satuansByProduk.get(r.id);
        if (!ss?.length) return r.satuan;
        return ss.map((s) => s.satuan + (s.isDefault ? " ✓" : "")).join(" / ");
      },
    },
    {
      header: "Stok",
      cell: (r) => {
        const entries = stokByProduk.get(r.id);
        if (!entries?.length) return <span className="text-muted-foreground text-xs">—</span>;
        return (
          <span className="flex flex-wrap gap-1">
            {entries.map((e) => (
              <span
                key={e.cabangNama}
                className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-xs tabular"
              >
                {e.cabangNama}: <strong>{e.qty}</strong>
              </span>
            ))}
          </span>
        );
      },
    },
    {
      header: "",
      align: "right",
      cell: (r) => (
        <button className={btn.ghost} onClick={() => openForm(r)}>
          <Pencil className="size-4" />
        </button>
      ),
    },
  ];

  const currentStok = edit ? stokByProduk.get(edit.id) : undefined;

  return (
    <>
      <TableHeader
        title="Master Produk"
        onAdd={() => openForm()}
        search={search}
        onSearch={handleSearch}
        searchPlaceholder="Cari nama / SKU..."
        filterSlot={
          <BulkUploadProduk />
        }
      />
      <DataTable columns={cols} rows={pageRows} getRowKey={(r) => r.id} />
      <Pagination
        page={page}
        total={filtered.length}
        pageSize={PAGE_SIZE}
        onChange={setPage}
      />
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={edit ? "Edit Produk" : "Produk Baru"}
      >
        {err && (
          <p className="mb-3 text-sm font-semibold text-critical">{err}</p>
        )}
        <Field label="Nama">
          <input
            className={input}
            value={f.nama}
            onChange={(e) => setF({ ...f, nama: e.target.value })}
          />
        </Field>
        <Field label="SKU">
          <input
            className={input}
            value={f.sku}
            onChange={(e) => setF({ ...f, sku: e.target.value })}
          />
        </Field>
        <div className="mb-3">
          <div className="mb-1.5 flex items-center justify-between">
            <label className={label}>Satuan</label>
            <button type="button" className={`${btn.ghost} text-xs`} onClick={addSatuan}>
              <Plus className="size-3" /> Tambah
            </button>
          </div>
          <div className="space-y-2">
            {satuans.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className={`${input} flex-1`}
                  value={s.satuan}
                  onChange={(e) => updateSatuan(i, { satuan: e.target.value })}
                  placeholder="dus / karton / pcs"
                />
                <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-sm">
                  <input
                    type="radio"
                    name="satuan-default"
                    checked={s.isDefault}
                    onChange={() => setDefaultSatuan(i)}
                    className="accent-primary"
                  />
                  Default
                </label>
              </div>
            ))}
          </div>
          {satuans.length > 1 && (
            <p className="mt-1 text-xs text-muted-foreground">Pilih satu satuan sebagai default (tanda ✓ di tabel).</p>
          )}
        </div>

        {/* Stok awal — hanya tampil saat CREATE */}
        {!edit && cabangs.length > 0 && (
          <div className="mb-3 rounded-md border border-border p-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Stok Awal per Cabang
            </p>
            <div className="grid grid-cols-2 gap-2">
              {cabangs.map((c) => (
                <div key={c.id}>
                  <label className={`${label} text-xs`}>{c.nama}</label>
                  <input
                    type="number"
                    min={0}
                    className={`${input} tabular`}
                    value={initialStocks[c.id] ?? 0}
                    onChange={(e) =>
                      setInitialStocks({ ...initialStocks, [c.id]: Math.max(0, Number(e.target.value)) })
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stok saat ini — hanya tampil saat EDIT */}
        {edit && (
          <div className="mb-3 rounded-md border border-border p-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Stok Saat Ini
            </p>
            {currentStok?.length ? (
              <div className="flex flex-wrap gap-2">
                {currentStok.map((e) => (
                  <span
                    key={e.cabangNama}
                    className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-sm"
                  >
                    {e.cabangNama}:&nbsp;<strong className="tabular">{e.qty}</strong>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Belum ada data stok.</p>
            )}
          </div>
        )}

        <button
          className={btn.primary}
          disabled={pending}
          onClick={() => {
            const stocks = edit
              ? undefined
              : Object.entries(initialStocks)
                  .map(([id, qty]) => ({ cabangId: Number(id), qty }))
                  .filter((s) => s.qty > 0);
            run(
              () => upsertProduk({ id: edit?.id, ...f, satuans, initialStocks: stocks }),
              () => setOpen(false),
            );
          }}
        >
          Simpan
        </button>
      </Dialog>
    </>
  );
}

// ── Cabang ────────────────────────────────────────────────────────────────────
type Cabang = { id: number; nama: string; alamat: string };
function MasterCabangPanel({ rows }: { rows: Cabang[] }) {
  const { pending, err, setErr, run } = useSave();
  const [edit, setEdit] = useState<Cabang | null>(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ nama: "", alamat: "" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  function openForm(c?: Cabang) {
    setErr(null);
    setEdit(c ?? null);
    setF(c ? { nama: c.nama, alamat: c.alamat } : { nama: "", alamat: "" });
    setOpen(true);
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.nama.toLowerCase().includes(q) ||
        r.alamat.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleSearch(v: string) {
    setSearch(v);
    setPage(1);
  }

  const cols: Column<Cabang>[] = [
    { header: "Nama", cell: (r) => r.nama },
    {
      header: "Alamat",
      cell: (r) => (
        <span className="text-muted-foreground">{r.alamat}</span>
      ),
    },
    {
      header: "",
      align: "right",
      cell: (r) => (
        <button className={btn.ghost} onClick={() => openForm(r)}>
          <Pencil className="size-4" />
        </button>
      ),
    },
  ];

  return (
    <>
      <TableHeader
        title="Master Cabang"
        onAdd={() => openForm()}
        search={search}
        onSearch={handleSearch}
        searchPlaceholder="Cari nama / alamat..."
      />
      <DataTable columns={cols} rows={pageRows} getRowKey={(r) => r.id} />
      <Pagination
        page={page}
        total={filtered.length}
        pageSize={PAGE_SIZE}
        onChange={setPage}
      />
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={edit ? "Edit Cabang" : "Cabang Baru"}
      >
        {err && (
          <p className="mb-3 text-sm font-semibold text-critical">{err}</p>
        )}
        <Field label="Nama">
          <input
            className={input}
            value={f.nama}
            onChange={(e) => setF({ ...f, nama: e.target.value })}
          />
        </Field>
        <Field label="Alamat">
          <input
            className={input}
            value={f.alamat}
            onChange={(e) => setF({ ...f, alamat: e.target.value })}
          />
        </Field>
        <button
          className={btn.primary}
          disabled={pending}
          onClick={() =>
            run(
              () => upsertCabang({ id: edit?.id, ...f }),
              () => setOpen(false)
            )
          }
        >
          Simpan
        </button>
      </Dialog>
    </>
  );
}

// ── Toko ──────────────────────────────────────────────────────────────────────
type TokoRow = {
  id: number;
  nama: string;
  alamat: string | null;
  noTelp: string | null;
  cabangId: number;
  cabangNama: string;
};
function MasterTokoPanel({
  rows,
  cabangs,
}: {
  rows: TokoRow[];
  cabangs: { id: number; nama: string }[];
}) {
  const { pending, err, setErr, run } = useSave();
  const [edit, setEdit] = useState<TokoRow | null>(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    nama: "",
    alamat: "",
    noTelp: "",
    cabangId: cabangs[0]?.id ?? 0,
  });
  const [search, setSearch] = useState("");
  const [filterCabang, setFilterCabang] = useState<number>(0);
  const [page, setPage] = useState(1);

  function openForm(t?: TokoRow) {
    setErr(null);
    setEdit(t ?? null);
    setF(
      t
        ? { nama: t.nama, alamat: t.alamat ?? "", noTelp: t.noTelp ?? "", cabangId: t.cabangId }
        : { nama: "", alamat: "", noTelp: "", cabangId: cabangs[0]?.id ?? 0 }
    );
    setOpen(true);
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        (filterCabang === 0 || r.cabangId === filterCabang) &&
        (r.nama.toLowerCase().includes(q) ||
          r.cabangNama.toLowerCase().includes(q) ||
          (r.noTelp ?? "").toLowerCase().includes(q))
    );
  }, [rows, search, filterCabang]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleSearch(v: string) {
    setSearch(v);
    setPage(1);
  }
  function handleFilterCabang(v: number) {
    setFilterCabang(v);
    setPage(1);
  }

  const cols: Column<TokoRow>[] = [
    { header: "Nama Toko", cell: (r) => r.nama },
    { header: "Cabang", cell: (r) => r.cabangNama },
    {
      header: "Telp",
      cell: (r) => (
        <span className="tabular text-muted-foreground">{r.noTelp ?? "-"}</span>
      ),
    },
    {
      header: "",
      align: "right",
      cell: (r) => (
        <button className={btn.ghost} onClick={() => openForm(r)}>
          <Pencil className="size-4" />
        </button>
      ),
    },
  ];

  return (
    <>
      <TableHeader
        title="Master Toko"
        onAdd={() => openForm()}
        search={search}
        onSearch={handleSearch}
        searchPlaceholder="Cari nama toko..."
        filterSlot={
          <div className="flex items-center gap-2">
            <select
              className={`${input} w-auto min-w-[140px]`}
              value={filterCabang}
              onChange={(e) => handleFilterCabang(Number(e.target.value))}
              aria-label="Filter cabang"
            >
              <option value={0}>Semua Cabang</option>
              {cabangs.map((c) => (
                <option key={c.id} value={c.id}>{c.nama}</option>
              ))}
            </select>
            <BulkUploadButton
              module="toko"
              dialogTitle="Toko"
              uploadAction={(rows) => uploadTokoAction(rows as UploadTokoRawRow[])}
              errorFilename={`error-toko-${new Date().toISOString().slice(0, 10)}.xlsx`}
            />
          </div>
        }
      />
      <DataTable columns={cols} rows={pageRows} getRowKey={(r) => r.id} />
      <Pagination
        page={page}
        total={filtered.length}
        pageSize={PAGE_SIZE}
        onChange={setPage}
      />
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={edit ? "Edit Toko" : "Toko Baru"}
      >
        {err && (
          <p className="mb-3 text-sm font-semibold text-critical">{err}</p>
        )}
        <Field label="Nama">
          <input
            className={input}
            value={f.nama}
            onChange={(e) => setF({ ...f, nama: e.target.value })}
          />
        </Field>
        <Field label="Cabang">
          <select
            className={input}
            value={f.cabangId}
            onChange={(e) => setF({ ...f, cabangId: Number(e.target.value) })}
          >
            {cabangs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nama}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Alamat">
          <input
            className={input}
            value={f.alamat}
            onChange={(e) => setF({ ...f, alamat: e.target.value })}
          />
        </Field>
        <Field label="No. Telp">
          <input
            className={input}
            value={f.noTelp}
            onChange={(e) => setF({ ...f, noTelp: e.target.value })}
          />
        </Field>
        <button
          className={btn.primary}
          disabled={pending}
          onClick={() =>
            run(
              () => upsertToko({ id: edit?.id, ...f }),
              () => setOpen(false)
            )
          }
        >
          Simpan
        </button>
      </Dialog>
    </>
  );
}

// ── Harga Cabang ──────────────────────────────────────────────────────────────
type HargaRow = {
  id: number;
  produkId: number;
  cabangId: number;
  harga: number;
  produkNama: string;
  cabangNama: string;
};
function MasterHargaPanel({
  rows,
  produks,
  cabangs,
}: {
  rows: HargaRow[];
  produks: { id: number; nama: string }[];
  cabangs: { id: number; nama: string }[];
}) {
  const { pending, err, setErr, run } = useSave();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    produkId: produks[0]?.id ?? 0,
    cabangId: cabangs[0]?.id ?? 0,
    harga: 0,
  });
  const [search, setSearch] = useState("");
  const [filterCabang, setFilterCabang] = useState<number>(0);
  const [page, setPage] = useState(1);

  function openForm(r?: HargaRow) {
    setErr(null);
    setF(
      r
        ? { produkId: r.produkId, cabangId: r.cabangId, harga: r.harga }
        : { produkId: produks[0]?.id ?? 0, cabangId: cabangs[0]?.id ?? 0, harga: 0 }
    );
    setOpen(true);
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        (filterCabang === 0 || r.cabangId === filterCabang) &&
        (r.produkNama.toLowerCase().includes(q) ||
          r.cabangNama.toLowerCase().includes(q))
    );
  }, [rows, search, filterCabang]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleSearch(v: string) {
    setSearch(v);
    setPage(1);
  }
  function handleFilterCabang(v: number) {
    setFilterCabang(v);
    setPage(1);
  }

  const cols: Column<HargaRow>[] = [
    { header: "Cabang", cell: (r) => r.cabangNama },
    { header: "Produk", cell: (r) => r.produkNama },
    { header: "Harga", align: "right", cell: (r) => rupiah(r.harga) },
    {
      header: "",
      align: "right",
      cell: (r) => (
        <button className={btn.ghost} onClick={() => openForm(r)}>
          <Pencil className="size-4" />
        </button>
      ),
    },
  ];

  return (
    <>
      <TableHeader
        title="Harga Dasar Cabang"
        onAdd={() => openForm()}
        search={search}
        onSearch={handleSearch}
        searchPlaceholder="Cari produk / cabang..."
        filterSlot={
          <div className="flex items-center gap-2">
            <select
              className={`${input} w-auto min-w-[140px]`}
              value={filterCabang}
              onChange={(e) => handleFilterCabang(Number(e.target.value))}
              aria-label="Filter cabang"
            >
              <option value={0}>Semua Cabang</option>
              {cabangs.map((c) => (
                <option key={c.id} value={c.id}>{c.nama}</option>
              ))}
            </select>
            <BulkUploadButton
              module="harga"
              dialogTitle="Harga Dasar"
              uploadAction={(rows) => uploadHargaAction(rows as UploadHargaRawRow[])}
              errorFilename={`error-harga-${new Date().toISOString().slice(0, 10)}.xlsx`}
            />
          </div>
        }
      />
      <DataTable columns={cols} rows={pageRows} getRowKey={(r) => r.id} />
      <Pagination
        page={page}
        total={filtered.length}
        pageSize={PAGE_SIZE}
        onChange={setPage}
      />
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Set Harga (per produk × cabang)"
      >
        {err && (
          <p className="mb-3 text-sm font-semibold text-critical">{err}</p>
        )}
        <Field label="Produk">
          <select
            className={input}
            value={f.produkId}
            onChange={(e) => setF({ ...f, produkId: Number(e.target.value) })}
          >
            {produks.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nama}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cabang">
          <select
            className={input}
            value={f.cabangId}
            onChange={(e) => setF({ ...f, cabangId: Number(e.target.value) })}
          >
            {cabangs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nama}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Harga (Rp)">
          <input
            type="number"
            min={0}
            className={`${input} tabular`}
            value={f.harga}
            onChange={(e) => setF({ ...f, harga: Number(e.target.value) })}
          />
        </Field>
        <button
          className={btn.primary}
          disabled={pending}
          onClick={() => run(() => upsertHarga(f), () => setOpen(false))}
        >
          Simpan
        </button>
      </Dialog>
    </>
  );
}

// ── Diskon Toko ───────────────────────────────────────────────────────────────
type DiskonRow = {
  id: number;
  tokoId: number;
  produkId: number;
  diskonPersen: number;
  diskonRupiah: number;
  batasPersen: number;
  batasRupiah: number;
  tokoNama: string;
  produkNama: string;
};
function MasterDiskonPanel({
  rows,
  tokos,
  produks,
}: {
  rows: DiskonRow[];
  tokos: { id: number; nama: string }[];
  produks: { id: number; nama: string }[];
}) {
  const { pending, err, setErr, run } = useSave();
  const [open, setOpen] = useState(false);
  const empty = {
    tokoId: tokos[0]?.id ?? 0,
    produkId: produks[0]?.id ?? 0,
    diskonPersen: 0,
    diskonRupiah: 0,
    batasPersen: 0,
    batasRupiah: 0,
  };
  const [f, setF] = useState(empty);
  const [search, setSearch] = useState("");
  const [filterToko, setFilterToko] = useState<number>(0);
  const [page, setPage] = useState(1);

  function openForm(r?: DiskonRow) {
    setErr(null);
    setF(
      r
        ? {
            tokoId: r.tokoId,
            produkId: r.produkId,
            diskonPersen: r.diskonPersen,
            diskonRupiah: r.diskonRupiah,
            batasPersen: r.batasPersen,
            batasRupiah: r.batasRupiah,
          }
        : empty
    );
    setOpen(true);
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        (filterToko === 0 || r.tokoId === filterToko) &&
        (r.tokoNama.toLowerCase().includes(q) ||
          r.produkNama.toLowerCase().includes(q))
    );
  }, [rows, search, filterToko]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleSearch(v: string) {
    setSearch(v);
    setPage(1);
  }
  function handleFilterToko(v: number) {
    setFilterToko(v);
    setPage(1);
  }

  const setN = (k: keyof typeof empty, v: string) =>
    setF({ ...f, [k]: Number(v) });

  const cols: Column<DiskonRow>[] = [
    { header: "Toko", cell: (r) => r.tokoNama },
    { header: "Produk", cell: (r) => r.produkNama },
    {
      header: "Diskon",
      align: "right",
      cell: (r) => (
        <span className="tabular">
          {r.diskonPersen}% / {rupiah(r.diskonRupiah)}
        </span>
      ),
    },
    {
      header: "Batas Maks",
      align: "right",
      cell: (r) => (
        <span className="tabular text-muted-foreground">
          {r.batasPersen}% / {rupiah(r.batasRupiah)}
        </span>
      ),
    },
    {
      header: "",
      align: "right",
      cell: (r) => (
        <button className={btn.ghost} onClick={() => openForm(r)}>
          <Pencil className="size-4" />
        </button>
      ),
    },
  ];

  return (
    <>
      <TableHeader
        title="Diskon Khusus Toko"
        onAdd={() => openForm()}
        search={search}
        onSearch={handleSearch}
        searchPlaceholder="Cari toko / produk..."
        filterSlot={
          <div className="flex items-center gap-2">
            <select
              className={`${input} w-auto min-w-[140px]`}
              value={filterToko}
              onChange={(e) => handleFilterToko(Number(e.target.value))}
              aria-label="Filter toko"
            >
              <option value={0}>Semua Toko</option>
              {tokos.map((t) => (
                <option key={t.id} value={t.id}>{t.nama}</option>
              ))}
            </select>
            <BulkUploadButton
              module="diskon"
              dialogTitle="Diskon Toko"
              uploadAction={(rows) => uploadDiskonAction(rows as UploadDiskonRawRow[])}
              errorFilename={`error-diskon-${new Date().toISOString().slice(0, 10)}.xlsx`}
            />
          </div>
        }
      />
      <DataTable
        columns={cols}
        rows={pageRows}
        getRowKey={(r) => r.id}
        empty="Belum ada diskon khusus."
      />
      <Pagination
        page={page}
        total={filtered.length}
        pageSize={PAGE_SIZE}
        onChange={setPage}
      />
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Set Diskon (per toko × produk)"
      >
        {err && (
          <p className="mb-3 text-sm font-semibold text-critical">{err}</p>
        )}
        <Field label="Toko">
          <select
            className={input}
            value={f.tokoId}
            onChange={(e) => setN("tokoId", e.target.value)}
          >
            {tokos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nama}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Produk">
          <select
            className={input}
            value={f.produkId}
            onChange={(e) => setN("produkId", e.target.value)}
          >
            {produks.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nama}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Diskon %">
            <input
              type="number"
              min={0}
              className={`${input} tabular`}
              value={f.diskonPersen}
              onChange={(e) => setN("diskonPersen", e.target.value)}
            />
          </Field>
          <Field label="Diskon Rp/unit">
            <input
              type="number"
              min={0}
              className={`${input} tabular`}
              value={f.diskonRupiah}
              onChange={(e) => setN("diskonRupiah", e.target.value)}
            />
          </Field>
          <Field label="Batas %">
            <input
              type="number"
              min={0}
              className={`${input} tabular`}
              value={f.batasPersen}
              onChange={(e) => setN("batasPersen", e.target.value)}
            />
          </Field>
          <Field label="Batas Rp/unit">
            <input
              type="number"
              min={0}
              className={`${input} tabular`}
              value={f.batasRupiah}
              onChange={(e) => setN("batasRupiah", e.target.value)}
            />
          </Field>
        </div>
        <button
          className={btn.primary}
          disabled={pending}
          onClick={() => run(() => upsertDiskon(f), () => setOpen(false))}
        >
          Simpan
        </button>
      </Dialog>
    </>
  );
}

// ── Users ─────────────────────────────────────────────────────────────────────
type UserRow = {
  id: number;
  nama: string;
  email: string;
  roleId: number;
  roleName: string;
  cabangId: number;
  cabangNama: string;
};

const ROLE_OPTS = [
  { id: 1, label: "Sales" },
  { id: 2, label: "Admin Fakturist" },
  { id: 3, label: "Gudang" },
  { id: 4, label: "Delivery" },
  { id: 5, label: "Incaso" },
  { id: 6, label: "Owner" },
  { id: 7, label: "Super Admin" },
];

function MasterUsersPanel({
  rows,
  cabangs,
  actorRoleId,
}: {
  rows: UserRow[];
  cabangs: { id: number; nama: string }[];
  actorRoleId: number;
}) {
  const { pending, err, setErr, run } = useSave();
  const [edit, setEdit] = useState<UserRow | null>(null);
  const [open, setOpen] = useState(false);
  const [delTarget, setDelTarget] = useState<UserRow | null>(null);
  const [f, setF] = useState({
    nama: "",
    email: "",
    password: "",
    confirmPassword: "",
    roleId: 1,
    cabangId: cabangs[0]?.id ?? 0,
  });
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<number>(0);
  const [page, setPage] = useState(1);

  const allowedRoles = actorRoleId === 7 ? ROLE_OPTS : ROLE_OPTS.filter((r) => r.id <= 5);

  function openForm(u?: UserRow) {
    setErr(null);
    setEdit(u ?? null);
    setF(
      u
        ? { nama: u.nama, email: u.email, password: "", confirmPassword: "", roleId: u.roleId, cabangId: u.cabangId }
        : { nama: "", email: "", password: "", confirmPassword: "", roleId: allowedRoles[0]?.id ?? 1, cabangId: cabangs[0]?.id ?? 0 }
    );
    setOpen(true);
  }

  function handleSave() {
    if (!edit && !f.password) {
      setErr("Password wajib diisi untuk user baru.");
      return;
    }
    if (f.password && f.password !== f.confirmPassword) {
      setErr("Konfirmasi password tidak cocok.");
      return;
    }
    if (edit) {
      run(
        () => updateUser({ id: edit.id, nama: f.nama, email: f.email, roleId: f.roleId, cabangId: f.cabangId, password: f.password || undefined }),
        () => setOpen(false)
      );
    } else {
      run(
        () => createUser({ nama: f.nama, email: f.email, password: f.password, roleId: f.roleId, cabangId: f.cabangId }),
        () => setOpen(false)
      );
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        (filterRole === 0 || r.roleId === filterRole) &&
        (r.nama.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.cabangNama.toLowerCase().includes(q))
    );
  }, [rows, search, filterRole]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleSearch(v: string) {
    setSearch(v);
    setPage(1);
  }

  const cols: Column<UserRow>[] = [
    { header: "Nama", cell: (r) => r.nama },
    { header: "Email", cell: (r) => <span className="tabular text-sm">{r.email}</span> },
    { header: "Role", cell: (r) => <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs font-medium">{r.roleName}</span> },
    { header: "Cabang", cell: (r) => r.cabangNama },
    {
      header: "",
      align: "right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <button className={btn.ghost} onClick={() => openForm(r)} aria-label="Edit">
            <Pencil className="size-4" />
          </button>
          <button className={`${btn.ghost} text-critical hover:text-critical`} onClick={() => setDelTarget(r)} aria-label="Hapus">
            <Trash2 className="size-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <TableHeader
        title="Manajemen Pengguna"
        onAdd={() => openForm()}
        search={search}
        onSearch={handleSearch}
        searchPlaceholder="Cari nama / email..."
        filterSlot={
          <select
            className={`${input} w-auto min-w-[140px]`}
            value={filterRole}
            onChange={(e) => { setFilterRole(Number(e.target.value)); setPage(1); }}
            aria-label="Filter role"
          >
            <option value={0}>Semua Role</option>
            {ROLE_OPTS.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        }
      />
      <DataTable columns={cols} rows={pageRows} getRowKey={(r) => r.id} empty="Belum ada pengguna." />
      <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />

      {/* Create / Edit dialog */}
      <Dialog open={open} onClose={() => setOpen(false)} title={edit ? "Edit Pengguna" : "Pengguna Baru"}>
        {err && <p className="mb-3 text-sm font-semibold text-critical">{err}</p>}
        <Field label="Nama">
          <input className={input} value={f.nama} onChange={(e) => setF({ ...f, nama: e.target.value })} />
        </Field>
        <Field label="Email">
          <input type="email" className={input} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label={edit ? "Password Baru (kosongkan jika tidak diubah)" : "Password"}>
          <input
            type="password"
            className={input}
            value={f.password}
            onChange={(e) => setF({ ...f, password: e.target.value })}
            placeholder="Min 8 karakter, 1 huruf kapital, 1 angka"
          />
        </Field>
        {(f.password || !edit) && (
          <Field label="Konfirmasi Password">
            <input
              type="password"
              className={input}
              value={f.confirmPassword}
              onChange={(e) => setF({ ...f, confirmPassword: e.target.value })}
            />
          </Field>
        )}
        <Field label="Role">
          <select className={input} value={f.roleId} onChange={(e) => setF({ ...f, roleId: Number(e.target.value) })}>
            {allowedRoles.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Cabang">
          <select className={input} value={f.cabangId} onChange={(e) => setF({ ...f, cabangId: Number(e.target.value) })}>
            {cabangs.map((c) => (
              <option key={c.id} value={c.id}>{c.nama}</option>
            ))}
          </select>
        </Field>
        <button className={btn.primary} disabled={pending} onClick={handleSave}>
          Simpan
        </button>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={delTarget !== null} onClose={() => setDelTarget(null)} title="Hapus Pengguna">
        {err && <p className="mb-3 text-sm font-semibold text-critical">{err}</p>}
        <p className="mb-4 text-sm">
          Hapus pengguna <strong>{delTarget?.nama}</strong> ({delTarget?.email})?
          Tindakan ini tidak bisa dibatalkan.
        </p>
        <div className="flex gap-2">
          <button
            className={btn.danger}
            disabled={pending}
            onClick={() => {
              if (!delTarget) return;
              run(() => deleteUser(delTarget.id), () => setDelTarget(null));
            }}
          >
            Hapus
          </button>
          <button className={btn.outline} onClick={() => setDelTarget(null)}>
            Batal
          </button>
        </div>
      </Dialog>
    </>
  );
}

// ── Root export — Tabbed Master Page ─────────────────────────────────────────
export function MasterDataTabs({
  produks,
  produkSatuans,
  cabangs,
  tokos,
  harga,
  diskon,
  stok,
  users,
  actorRoleId,
}: {
  produks: Produk[];
  produkSatuans: ProdukSatuanRow[];
  cabangs: Cabang[];
  tokos: TokoRow[];
  harga: HargaRow[];
  diskon: DiskonRow[];
  stok: StokEntry[];
  users: UserRow[];
  actorRoleId: number;
}) {
  const produkOpts = produks.map((p) => ({ id: p.id, nama: p.nama }));
  const cabangOpts = cabangs.map((c) => ({ id: c.id, nama: c.nama }));
  const tokoOpts = tokos.map((t) => ({ id: t.id, nama: t.nama }));

  return (
    <Tabs defaultValue="produk">
      <TabsList className="mb-6 w-full sm:w-auto">
        <TabsTrigger value="cabang">Cabang</TabsTrigger>
        <TabsTrigger value="produk">Produk</TabsTrigger>
        <TabsTrigger value="toko">Toko</TabsTrigger>
        <TabsTrigger value="harga">Harga Dasar</TabsTrigger>
        <TabsTrigger value="diskon">Diskon Toko</TabsTrigger>
        <TabsTrigger value="pengguna">Pengguna</TabsTrigger>
      </TabsList>

      <TabsContent value="cabang">
        <MasterCabangPanel rows={cabangs} />
      </TabsContent>
      <TabsContent value="produk">
        <MasterProdukPanel rows={produks} cabangs={cabangOpts} stok={stok} produkSatuans={produkSatuans} />
      </TabsContent>
      <TabsContent value="toko">
        <MasterTokoPanel rows={tokos} cabangs={cabangOpts} />
      </TabsContent>
      <TabsContent value="harga">
        <MasterHargaPanel rows={harga} produks={produkOpts} cabangs={cabangOpts} />
      </TabsContent>
      <TabsContent value="diskon">
        <MasterDiskonPanel rows={diskon} tokos={tokoOpts} produks={produkOpts} />
      </TabsContent>
      <TabsContent value="pengguna">
        <MasterUsersPanel rows={users} cabangs={cabangOpts} actorRoleId={actorRoleId} />
      </TabsContent>
    </Tabs>
  );
}


