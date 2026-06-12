"use client";

import { Search, X, Filter } from "lucide-react";
import { input, label as labelCls } from "@/lib/ui";

export type FilterOption = { value: string; label: string };

export type AuditFilterState = {
  q: string;
  pelaku: string;
  aksi: string;
  dari: string; // YYYY-MM-DD
  sampai: string; // YYYY-MM-DD
};

export const EMPTY_FILTER: AuditFilterState = {
  q: "",
  pelaku: "",
  aksi: "",
  dari: "",
  sampai: "",
};

// Filter bar investigatif: telusuri jejak berdasarkan pelaku tertentu, jenis aksi,
// rentang tanggal, dan pencarian wildcard (nomor referensi/order/detail). Tajam
// untuk melacak kasus spesifik (mis. "semua aksi user X minggu ini").
export function AuditFilterBar({
  value,
  onChange,
  pelakuOptions,
  aksiOptions,
  resultCount,
  totalCount,
}: {
  value: AuditFilterState;
  onChange: (next: AuditFilterState) => void;
  pelakuOptions: FilterOption[];
  aksiOptions: FilterOption[];
  resultCount: number;
  totalCount: number;
}) {
  const set = (patch: Partial<AuditFilterState>) => onChange({ ...value, ...patch });
  const aktif =
    value.q || value.pelaku || value.aksi || value.dari || value.sampai;

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {/* Pencarian wildcard */}
        <div className="sm:col-span-2 lg:col-span-2">
          <label className={labelCls}>Cari (No. ref / order / detail)</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={value.q}
              onChange={(e) => set({ q: e.target.value })}
              placeholder="mis. INV-123, order, selisih…"
              className={`${input} pl-8`}
            />
          </div>
        </div>

        {/* Pelaku */}
        <div className="lg:col-span-1">
          <label className={labelCls}>Pelaku</label>
          <select
            value={value.pelaku}
            onChange={(e) => set({ pelaku: e.target.value })}
            className={input}
          >
            <option value="">Semua</option>
            {pelakuOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Aksi */}
        <div className="lg:col-span-1">
          <label className={labelCls}>Jenis Aksi</label>
          <select
            value={value.aksi}
            onChange={(e) => set({ aksi: e.target.value })}
            className={input}
          >
            <option value="">Semua</option>
            {aksiOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Dari */}
        <div className="lg:col-span-1">
          <label className={labelCls}>Dari</label>
          <input
            type="date"
            value={value.dari}
            onChange={(e) => set({ dari: e.target.value })}
            className={input}
          />
        </div>

        {/* Sampai */}
        <div className="lg:col-span-1">
          <label className={labelCls}>Sampai</label>
          <input
            type="date"
            value={value.sampai}
            onChange={(e) => set({ sampai: e.target.value })}
            className={input}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Filter className="size-3.5" />
          Menampilkan <span className="font-semibold text-foreground">{resultCount}</span> dari{" "}
          {totalCount} aktivitas
        </span>
        {aktif && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTER)}
            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
          >
            <X className="size-3.5" /> Reset filter
          </button>
        )}
      </div>
    </div>
  );
}
