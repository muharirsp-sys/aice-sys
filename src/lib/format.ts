// Helper format tampilan.

// Rupiah tanpa desimal (FMCG IDR), pemisah ribuan id-ID.
export function rupiah(n: number): string {
  return "Rp" + n.toLocaleString("id-ID");
}

// Persen dengan koma desimal id-ID + tanda.
export function persenDelta(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "" : "";
  return sign + n.toLocaleString("id-ID", { maximumFractionDigits: 1 }) + "%";
}

// Tanggal pendek id-ID.
export function tglPendek(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Waktu relatif ("8 menit lalu", "2 jam lalu").
export function relativeTime(iso: string, now: number = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const menit = Math.floor(diff / 60000);
  if (menit < 1) return "baru saja";
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  const hari = Math.floor(jam / 24);
  return `${hari} hari lalu`;
}
