import { Clock, AlertTriangle } from "lucide-react";

// Hitung umur dokumen pada satu stage & beri badge aging.
// Auditor butuh tahu dokumen mana yang "menggantung" terlalu lama di satu tahap
// (indikasi macet / human error / potensi penundaan setoran).

const HARI = 86400000;
const JAM = 3600000;

function durasiSingkat(ms: number): string {
  if (ms < JAM) return `${Math.max(1, Math.floor(ms / 60000))} mnt`;
  if (ms < HARI) return `${Math.floor(ms / JAM)} jam`;
  return `${Math.floor(ms / HARI)} hr`;
}

// since: ISO waktu masuk stage. until: ISO waktu keluar stage (null = masih terbuka/now).
// warnHari & critHari: ambang aging (default 1 hari warning, 2 hari critical).
export function SlaBadge({
  since,
  until = null,
  warnHari = 1,
  critHari = 2,
  now = Date.now(),
}: {
  since: string | null;
  until?: string | null;
  warnHari?: number;
  critHari?: number;
  now?: number;
}) {
  if (!since) return null;

  const akhir = until ? new Date(until).getTime() : now;
  const durasi = Math.max(0, akhir - new Date(since).getTime());
  const hari = durasi / HARI;

  const level: "ok" | "warning" | "critical" =
    hari >= critHari ? "critical" : hari >= warnHari ? "warning" : "ok";

  // Sudah selesai & dalam batas wajar → tidak perlu badge.
  if (until && level === "ok") return null;

  const cls = {
    ok: "bg-muted text-muted-foreground",
    warning: "bg-warning/15 text-warning-foreground",
    critical: "bg-critical/12 text-critical",
  }[level];

  const Icon = level === "critical" ? AlertTriangle : Clock;
  const prefix = until ? "Selesai dlm" : level === "ok" ? "Berjalan" : "Tertahan";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${cls}`}
      title={`${prefix} ${durasiSingkat(durasi)}${until ? "" : " (belum lanjut tahap berikutnya)"}`}
    >
      <Icon className="size-3.5" />
      {prefix} {durasiSingkat(durasi)}
    </span>
  );
}
