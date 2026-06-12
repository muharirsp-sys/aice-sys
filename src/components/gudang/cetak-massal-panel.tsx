"use client";

import { FileText } from "lucide-react";
import { btn } from "@/lib/ui";
import { rupiah } from "@/lib/format";
import { totalItems } from "@/lib/pricing-calc";
import type { OrderView } from "@/lib/order-status";

export function CetakMassalPanel({ unprinted }: { unprinted: OrderView[] }) {
  if (unprinted.length === 0)
    return (
      <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
        Semua faktur sudah dicetak.
      </p>
    );

  return (
    <section className="mb-4 rounded-lg border bg-card p-4">
      <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Faktur Belum Dicetak ({unprinted.length})
      </h2>
      <div className="space-y-2">
        {unprinted.map((o) => (
          <div key={o.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
            <span className="text-sm">
              <span className="tabular font-bold">#{o.id}</span>
              {" · "}
              {o.tokoNama}
              {" · "}
              <span className="tabular">{rupiah(totalItems(o.items))}</span>
            </span>
            <a href={`/pdf/faktur/${o.id}`} target="_blank" rel="noopener noreferrer" className={btn.outline}>
              <FileText className="size-4" /> Cetak
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
