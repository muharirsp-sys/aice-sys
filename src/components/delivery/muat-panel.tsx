"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { btn } from "@/lib/ui";
import { rupiah } from "@/lib/format";
import { totalItems } from "@/lib/pricing-calc";
import type { OrderView } from "@/lib/order-status";
import { muatOrder } from "@/server/actions";

export function MuatPanel({ orders }: { orders: OrderView[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Set<number>>(new Set());

  function muat(id: number) {
    setErr(null);
    start(async () => {
      const r = await muatOrder(id);
      if (!r.ok) setErr(r.error);
      else {
        setLoaded((prev) => new Set(prev).add(id));
        router.refresh();
      }
    });
  }

  if (orders.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-muted-foreground">
        Tidak ada barang yang perlu dimuat. ✔
      </p>
    );
  }

  return (
    <>
      {err && (
        <p className="mb-3 rounded-md border border-l-4 border-l-critical bg-critical/10 p-3 text-sm font-semibold text-critical">
          {err}
        </p>
      )}
      <div className="space-y-3">
        {orders.map((o) => (
          <div key={o.id} className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="tabular font-bold">Faktur #{o.id}</span>
              <span className="font-semibold">{o.tokoNama}</span>
              <span className="ml-auto tabular font-semibold">{rupiah(totalItems(o.items))}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{o.tokoAlamat}</p>
            <ul className="mt-2 space-y-0.5 text-sm text-muted-foreground">
              {o.items.map((i) => (
                <li key={i.produkId} className="tabular">
                  {i.qty} {i.satuan} — {i.nama}
                </li>
              ))}
            </ul>
            <div className="mt-3">
              <button
                className={loaded.has(o.id) ? btn.ghost : btn.primary}
                disabled={pending || loaded.has(o.id)}
                onClick={() => muat(o.id)}
              >
                <PackageCheck className="size-4" />
                {loaded.has(o.id) ? "Dimuat ✔" : "Konfirmasi Muat"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
