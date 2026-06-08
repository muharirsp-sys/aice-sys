import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { persenDelta } from "@/lib/format";

// KPI Card (§8.6): angka besar tabular + delta vs kemarin (panah + warna semantik).
export function KpiCard({
  title,
  value,
  delta,
  sub,
  valueClass,
}: {
  title: string;
  value: string;
  delta?: number;
  sub?: string;
  valueClass?: string;
}) {
  const up = delta != null && delta > 0;
  const down = delta != null && delta < 0;
  const DeltaIcon = up ? TrendingUp : down ? TrendingDown : Minus;
  const deltaTone = up ? "text-ok" : down ? "text-critical" : "text-muted-foreground";

  return (
    <div className="rounded-lg border bg-card p-5">
      <p className="text-sm font-semibold text-muted-foreground">{title}</p>
      <p
        className={`tabular mt-2 text-[40px] font-extrabold leading-none tracking-tight ${valueClass ?? ""}`}
      >
        {value}
      </p>
      {delta != null ? (
        <p className={`mt-3 inline-flex items-center gap-1 text-sm font-semibold ${deltaTone}`}>
          <DeltaIcon className="size-4" />
          <span className="tabular">{persenDelta(delta)}</span>
          <span className="font-normal text-muted-foreground">vs kemarin</span>
        </p>
      ) : (
        sub && <p className="mt-3 text-sm text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}
