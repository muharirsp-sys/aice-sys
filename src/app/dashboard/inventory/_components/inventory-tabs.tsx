"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DataTable, type Column } from "@/components/ui/data-table";
import { format } from "@/lib/format";
import type { PosisiStokRow, KartuStokRow, KartuStokTipe } from "@/lib/inventory-types";

// Re-export agar page.tsx tetap bisa import dari sini (single import point untuk UI).
export type { PosisiStokRow, KartuStokRow };

// ── Badge tipe mutasi ────────────────────────────────────────────────────────

const TIPE_STYLE: Record<KartuStokTipe, string> = {
  IN: "bg-emerald-100 text-emerald-700",
  OUT: "bg-rose-100 text-rose-700",
  ADJUSTMENT: "bg-amber-100 text-amber-700",
  SALDO_AWAL: "bg-sky-100 text-sky-700",
  // Nilai lama — tampil jika DB masih punya baris sebelum migrasi enum.
  MASUK: "bg-emerald-100 text-emerald-700",
  KELUAR: "bg-rose-100 text-rose-700",
  KOREKSI: "bg-amber-100 text-amber-700",
};

const TIPE_LABEL: Record<KartuStokTipe, string> = {
  IN: "Masuk",
  OUT: "Keluar",
  ADJUSTMENT: "Koreksi",
  SALDO_AWAL: "Saldo Awal",
  MASUK: "Masuk",
  KELUAR: "Keluar",
  KOREKSI: "Koreksi",
};

function MovementBadge({ tipe }: { tipe: KartuStokTipe }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
        TIPE_STYLE[tipe] ?? "bg-muted text-muted-foreground"
      }`}
    >
      {TIPE_LABEL[tipe] ?? tipe}
    </span>
  );
}

// ── Kolom Posisi Stok ────────────────────────────────────────────────────────

const posisiColumns: Column<PosisiStokRow>[] = [
  {
    header: "Produk",
    cell: (r) => (
      <span className="font-medium">{r.namaProduk}</span>
    ),
  },
  {
    header: "SKU",
    cell: (r) => (
      <span className="font-mono text-xs text-muted-foreground">{r.sku}</span>
    ),
  },
  {
    header: "Satuan",
    cell: (r) => r.satuan,
  },
  {
    header: "Stok",
    align: "right",
    cell: (r) => (
      <span
        className={`font-semibold tabular-nums ${
          r.qty === 0 ? "text-rose-600" : r.qty <= 10 ? "text-amber-600" : "text-foreground"
        }`}
      >
        {r.qty.toLocaleString("id-ID")}
      </span>
    ),
  },
  {
    header: "Terakhir Update",
    cell: (r) =>
      r.updatedAt
        ? format.dateTime(r.updatedAt)
        : <span className="text-muted-foreground">—</span>,
  },
];

// ── Kolom Kartu Stok ─────────────────────────────────────────────────────────

const kartuColumns: Column<KartuStokRow>[] = [
  {
    header: "Tanggal",
    cell: (r) => (
      <span className="whitespace-nowrap text-xs">{format.dateTime(r.createdAt)}</span>
    ),
  },
  {
    header: "Produk",
    cell: (r) => r.namaProduk,
  },
  {
    header: "Tipe",
    cell: (r) => <MovementBadge tipe={r.tipe} />,
  },
  {
    header: "Qty In",
    align: "right",
    cell: (r) =>
      r.tipe === "IN" || r.tipe === "MASUK" ? (
        <span className="font-semibold tabular-nums text-emerald-600">
          +{r.qty.toLocaleString("id-ID")}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    header: "Qty Out / Adj",
    align: "right",
    cell: (r) =>
      r.tipe === "OUT" || r.tipe === "KELUAR" ? (
        <span className="font-semibold tabular-nums text-rose-600">
          -{r.qty.toLocaleString("id-ID")}
        </span>
      ) : r.tipe === "ADJUSTMENT" || r.tipe === "KOREKSI" ? (
        <span className="font-semibold tabular-nums text-amber-600">
          ±{r.qty.toLocaleString("id-ID")}
        </span>
      ) : r.tipe === "SALDO_AWAL" ? (
        <span className="font-semibold tabular-nums text-sky-600">
          {r.qty.toLocaleString("id-ID")}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    header: "Sisa Akhir",
    align: "right",
    cell: (r) => (
      <span className="font-semibold tabular-nums">
        {r.qtySaldo.toLocaleString("id-ID")}
      </span>
    ),
  },
  {
    header: "Referensi",
    cell: (r) =>
      r.referenceId ?? <span className="text-muted-foreground">—</span>,
  },
  {
    header: "User",
    cell: (r) => (
      <span className="text-xs text-muted-foreground">{r.namaUser}</span>
    ),
  },
];

// ── Main Client Component ────────────────────────────────────────────────────

export function InventoryTabs({
  posisiStok,
  kartuStok,
}: {
  posisiStok: PosisiStokRow[];
  kartuStok: KartuStokRow[];
}) {
  return (
    <Tabs defaultValue="posisi">
      <TabsList className="mb-4">
        <TabsTrigger value="posisi">Posisi Stok ({posisiStok.length})</TabsTrigger>
        <TabsTrigger value="kartu">Kartu Stok ({kartuStok.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="posisi">
        <DataTable
          columns={posisiColumns}
          rows={posisiStok}
          getRowKey={(r) => r.produkId}
          empty="Belum ada data stok untuk cabang ini."
        />
      </TabsContent>

      <TabsContent value="kartu">
        <DataTable
          columns={kartuColumns}
          rows={kartuStok}
          getRowKey={(r) => r.id}
          empty="Belum ada riwayat mutasi stok."
        />
      </TabsContent>
    </Tabs>
  );
}
