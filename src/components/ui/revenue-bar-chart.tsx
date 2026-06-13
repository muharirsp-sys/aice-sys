"use client";

import { rupiah } from "@/lib/format";

type DataPoint = { label: string; amount: number };

export function RevenueBarChart({ data }: { data: DataPoint[] }) {
  const max = Math.max(...data.map((d) => d.amount), 1);
  const W = 560;
  const H = 100;
  const barCount = data.length;
  const gap = 6;
  const barW = (W - gap * (barCount - 1)) / barCount;

  return (
    <div className="space-y-1">
      <svg viewBox={`0 0 ${W} ${H + 24}`} className="w-full h-auto">
        {data.map((d, i) => {
          const barH = Math.max(3, (d.amount / max) * H);
          const x = i * (barW + gap);
          const y = H - barH;
          const isToday = i === data.length - 1;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={3}
                style={{ fill: "var(--color-ok, #1f7a52)", opacity: isToday ? 1 : 0.35 }}
              />
              <text
                x={x + barW / 2}
                y={H + 16}
                textAnchor="middle"
                fontSize={9}
                style={{ fill: "var(--color-muted-foreground, #6b7280)" }}
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
        <span>Min: {rupiah(Math.min(...data.map((d) => d.amount)))}</span>
        <span>Maks: {rupiah(max)}</span>
      </div>
    </div>
  );
}
