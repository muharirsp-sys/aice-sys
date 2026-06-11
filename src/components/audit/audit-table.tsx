"use client";

import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight } from "lucide-react";
import { AuditDiff } from "@/components/audit/audit-diff";

export type AuditRow = {
  id: number;
  waktu: string;
  pelaku: string;
  aksi: string;
  tabel: string;
  detail: string;
  // Nilai mentah untuk diff lama→baru (jejak perubahan).
  oldValue: string | null;
  newValue: string | null;
  // Field mentah untuk filtering investigatif (tidak dirender langsung).
  ts: string; // ISO timestamp
  pelakuKey: string; // id pelaku (stabil untuk filter)
  aksiCode: string; // kode aksi mentah
};

const ROW_H = 48;

// Tabel virtualisasi: hanya baris yang terlihat yang dirender (ringan di perangkat
// low-end walau ribuan baris). Header sticky, baris ≥44px (§8.6). Baris bisa
// di-expand untuk melihat diff lama→baru (audit trail penuh).
export function AuditTable({ rows }: { rows: AuditRow[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  // eslint-disable-next-line react-hooks/incompatible-library
  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 12,
    // Re-ukur saat baris terbuka/tertutup (tinggi dinamis untuk panel diff).
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-muted-foreground">
        Belum ada aktivitas.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border text-sm">
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          {/* Header */}
          <div className="flex border-b bg-surface text-xs font-semibold text-muted-foreground">
            <div className="w-9 shrink-0 px-2 py-2.5" />
            <div className="w-32 shrink-0 px-3 py-2.5">Waktu</div>
            <div className="w-44 shrink-0 px-3 py-2.5">Pelaku</div>
            <div className="w-36 shrink-0 px-3 py-2.5">Aksi</div>
            <div className="w-24 shrink-0 px-3 py-2.5">Tabel</div>
            <div className="flex-1 px-3 py-2.5">Detail</div>
          </div>
          {/* Body virtualisasi */}
          <div ref={parentRef} className="overflow-y-auto" style={{ maxHeight: "65vh" }}>
            <div style={{ height: virt.getTotalSize(), position: "relative" }}>
              {virt.getVirtualItems().map((vi) => {
                const r = rows[vi.index];
                const open = openId === r.id;
                return (
                  <div
                    key={r.id}
                    data-index={vi.index}
                    ref={virt.measureElement}
                    className="absolute left-0 w-full border-b even:bg-muted/40"
                    style={{ transform: `translateY(${vi.start}px)` }}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : r.id)}
                      aria-expanded={open}
                      className="flex w-full items-center text-left hover:bg-muted/60"
                      style={{ minHeight: ROW_H }}
                    >
                      <span className="grid w-9 shrink-0 place-items-center text-muted-foreground">
                        <ChevronRight
                          className={`size-4 transition-transform ${open ? "rotate-90" : ""}`}
                        />
                      </span>
                      <span className="tabular w-32 shrink-0 whitespace-nowrap px-3">{r.waktu}</span>
                      <span className="w-44 shrink-0 truncate px-3">{r.pelaku}</span>
                      <span className="w-36 shrink-0 px-3">
                        <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-semibold">
                          {r.aksi}
                        </span>
                      </span>
                      <span className="w-24 shrink-0 truncate px-3 text-muted-foreground">{r.tabel}</span>
                      <span className="flex-1 truncate px-3 text-muted-foreground">{r.detail}</span>
                    </button>

                    {open && (
                      <div className="border-t bg-card px-4 py-3 pl-12">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Perubahan data (lama → baru)
                        </p>
                        <AuditDiff oldValue={r.oldValue} newValue={r.newValue} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
