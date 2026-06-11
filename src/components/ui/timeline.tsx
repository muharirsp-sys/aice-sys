import type { ReactNode } from "react";
import {
  Check,
  Clock,
  AlertOctagon,
  type LucideIcon,
} from "lucide-react";
import { relativeTime } from "@/lib/format";

export type TimelineLevel = "ok" | "warning" | "critical" | "pending";

export type TimelineNode = {
  id: string;
  // Ikon stage (opsional; default titik bulat).
  icon?: LucideIcon;
  title: string;
  // Pelaku aksi (siapa). Ditebalkan agar jejak audit jelas.
  pelaku?: string;
  // ISO waktu kejadian. Tampil sebagai absolut + relatif.
  waktu?: string | null;
  // Status sebelum → sesudah (jejak perubahan). Dirender sebagai diff.
  dari?: string;
  ke?: string;
  level?: TimelineLevel;
  // Konten tambahan (badge SLA, link bukti, nominal, dsb).
  extra?: ReactNode;
  done: boolean;
};

const DOT: Record<TimelineLevel, string> = {
  ok: "bg-ok text-ok-foreground border-ok",
  warning: "bg-warning text-warning-foreground border-warning",
  critical: "bg-critical text-critical-foreground border-critical",
  pending: "bg-muted text-muted-foreground border-border",
};

function waktuAbsolut(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Timeline kronologis vertikal untuk jejak audit satu order:
// siapa → kapan → apa (status lama → baru). Menggantikan grid section terpisah
// agar alur dokumen terbaca dalam satu urutan waktu.
export function ActivityTimeline({ nodes }: { nodes: TimelineNode[] }) {
  return (
    <ol className="relative space-y-0">
      {nodes.map((n, i) => {
        const level: TimelineLevel = n.level ?? (n.done ? "ok" : "pending");
        const Icon: LucideIcon =
          n.icon ?? (level === "critical" ? AlertOctagon : n.done ? Check : Clock);
        const isLast = i === nodes.length - 1;

        return (
          <li key={n.id} className="relative flex gap-3 pb-5 last:pb-0">
            {/* Garis penghubung vertikal */}
            {!isLast && (
              <span
                aria-hidden
                className="absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-px bg-border"
              />
            )}
            {/* Node */}
            <span
              className={`relative z-10 grid size-8 shrink-0 place-items-center rounded-full border ${DOT[level]}`}
            >
              <Icon className="size-4" />
            </span>

            {/* Konten */}
            <div className={`min-w-0 flex-1 ${n.done ? "" : "opacity-70"}`}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold">{n.title}</span>
                {(n.dari || n.ke) && (
                  <span className="inline-flex items-center gap-1 text-xs">
                    {n.dari && (
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground line-through">
                        {n.dari}
                      </span>
                    )}
                    <span className="text-muted-foreground">→</span>
                    {n.ke && (
                      <span className="rounded bg-ok/15 px-1.5 py-0.5 font-mono font-semibold text-ok">
                        {n.ke}
                      </span>
                    )}
                  </span>
                )}
              </div>

              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                {n.pelaku && <span className="font-medium text-foreground">{n.pelaku}</span>}
                {n.waktu && (
                  <span className="tabular" title={waktuAbsolut(n.waktu)}>
                    {waktuAbsolut(n.waktu)} · {relativeTime(n.waktu)}
                  </span>
                )}
                {!n.done && !n.waktu && <span className="italic">Belum diproses</span>}
              </div>

              {n.extra && <div className="mt-2">{n.extra}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
