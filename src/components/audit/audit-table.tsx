"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

export type AuditRow = {
  id: number;
  waktu: string;
  pelaku: string;
  aksi: string;
  tabel: string;
  detail: string;
};

const ROW_H = 48;

// Tabel virtualisasi: hanya baris yang terlihat yang dirender (ringan di perangkat
// low-end walau ribuan baris). Header sticky, baris ≥44px (§8.6).
export function AuditTable({ rows }: { rows: AuditRow[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library
  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 12,
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
        <div className="min-w-[720px]">
          {/* Header */}
          <div className="flex border-b bg-surface text-xs font-semibold text-muted-foreground">
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
                return (
                  <div
                    key={r.id}
                    className="absolute left-0 flex w-full items-center border-b even:bg-muted/40"
                    style={{ transform: `translateY(${vi.start}px)`, height: ROW_H }}
                  >
                    <div className="tabular w-32 shrink-0 whitespace-nowrap px-3">{r.waktu}</div>
                    <div className="w-44 shrink-0 truncate px-3">{r.pelaku}</div>
                    <div className="w-36 shrink-0 px-3">
                      <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-semibold">
                        {r.aksi}
                      </span>
                    </div>
                    <div className="w-24 shrink-0 truncate px-3 text-muted-foreground">{r.tabel}</div>
                    <div className="flex-1 truncate px-3 text-muted-foreground">{r.detail}</div>
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
