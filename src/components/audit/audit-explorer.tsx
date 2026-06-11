"use client";

import { useMemo, useState } from "react";
import { AuditTable, type AuditRow } from "@/components/audit/audit-table";
import {
  AuditFilterBar,
  EMPTY_FILTER,
  type AuditFilterState,
  type FilterOption,
} from "@/components/audit/audit-filter-bar";

// Wrapper client: menerapkan filter investigatif lalu mengoper baris terfilter ke
// tabel virtualisasi. Filtering dilakukan client-side (data audit sudah dibatasi
// di server) agar interaktif tanpa round-trip.
export function AuditExplorer({ rows }: { rows: AuditRow[] }) {
  const [filter, setFilter] = useState<AuditFilterState>(EMPTY_FILTER);

  // Opsi pelaku & aksi unik dari data.
  const pelakuOptions: FilterOption[] = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.pelakuKey, r.pelaku);
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [rows]);

  const aksiOptions: FilterOption[] = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.aksiCode, r.aksi);
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [rows]);

  const filtered = useMemo(() => {
    const q = filter.q.trim().toLowerCase();
    // Rentang tanggal inklusif (sampai = akhir hari).
    const dari = filter.dari ? new Date(filter.dari + "T00:00:00").getTime() : null;
    const sampai = filter.sampai ? new Date(filter.sampai + "T23:59:59.999").getTime() : null;

    return rows.filter((r) => {
      if (filter.pelaku && r.pelakuKey !== filter.pelaku) return false;
      if (filter.aksi && r.aksiCode !== filter.aksi) return false;

      if (dari != null || sampai != null) {
        const t = new Date(r.ts).getTime();
        if (dari != null && t < dari) return false;
        if (sampai != null && t > sampai) return false;
      }

      if (q) {
        const hay = `${r.pelaku} ${r.aksi} ${r.tabel} ${r.detail} ${r.oldValue ?? ""} ${r.newValue ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filter]);

  return (
    <div className="space-y-3">
      <AuditFilterBar
        value={filter}
        onChange={setFilter}
        pelakuOptions={pelakuOptions}
        aksiOptions={aksiOptions}
        resultCount={filtered.length}
        totalCount={rows.length}
      />
      <AuditTable rows={filtered} />
    </div>
  );
}
