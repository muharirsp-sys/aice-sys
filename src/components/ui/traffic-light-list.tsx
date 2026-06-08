import { AlertOctagon, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Alert, AlertLevel } from "@/lib/order-status";

const LEVEL_META: Record<
  AlertLevel,
  { accent: string; badge: string; label: string; Icon: typeof AlertOctagon }
> = {
  critical: {
    accent: "border-l-critical",
    badge: "bg-critical/12 text-critical",
    label: "Critical",
    Icon: AlertOctagon,
  },
  warning: {
    accent: "border-l-warning",
    badge: "bg-warning/20 text-warning-foreground",
    label: "Warning",
    Icon: AlertTriangle,
  },
  ok: {
    accent: "border-l-ok",
    badge: "bg-ok/15 text-ok",
    label: "OK",
    Icon: CheckCircle2,
  },
};

// Traffic Light Alert List (§8.6): badge level, judul tebal, waktu relatif,
// garis aksen kiri sesuai level. Urut berdasarkan severity lalu waktu (oleh pemanggil).
export function TrafficLightList({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        Tidak ada peringatan aktif.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {alerts.map((a) => {
        const m = LEVEL_META[a.level];
        return (
          <li
            key={a.id}
            className={`flex items-start gap-3 rounded-md border border-l-4 bg-card p-4 ${m.accent}`}
          >
            <m.Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${m.badge}`}
                >
                  {m.label}
                </span>
                <span className="text-xs text-muted-foreground">{a.time}</span>
              </div>
              <p className="mt-1 font-semibold">{a.title}</p>
              <p className="text-sm text-muted-foreground">{a.desc}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
