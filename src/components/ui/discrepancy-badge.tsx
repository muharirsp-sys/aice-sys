import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { rupiah } from "@/lib/format";

// Badge selisih nominal: merah jika ada selisih (≠0), hijau jika balance.
// Dipakai di list order, order-detail, dan panel rekonsiliasi agar auditor bisa
// memindai cepat baris mana yang bermasalah tanpa membuka detail.
export function DiscrepancyBadge({
  selisih,
  // Toleransi pembulatan (mis. 0 = harus persis). Di atas ini dianggap selisih.
  tolerance = 0,
  // labelOk muncul saat balance; null untuk menyembunyikan badge balance.
  labelOk = "Balance",
}: {
  selisih: number;
  tolerance?: number;
  labelOk?: string | null;
}) {
  const ok = Math.abs(selisih) <= tolerance;

  if (ok) {
    if (labelOk == null) return null;
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-ok/15 px-2 py-0.5 text-xs font-semibold text-ok">
        <CheckCircle2 className="size-3.5" />
        {labelOk}
      </span>
    );
  }

  const arah = selisih > 0 ? "Lebih" : "Kurang";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md bg-critical/12 px-2 py-0.5 text-xs font-semibold text-critical"
      title={`Selisih ${arah}: ${rupiah(Math.abs(selisih))}`}
    >
      <AlertTriangle className="size-3.5" />
      {arah} {rupiah(Math.abs(selisih))}
    </span>
  );
}
