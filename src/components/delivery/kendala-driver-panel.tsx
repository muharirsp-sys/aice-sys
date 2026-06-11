"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Truck } from "lucide-react";
import { btn } from "@/lib/ui";
import { adjustKendalaDriver } from "@/server/kendala-actions";
import { tglPendek } from "@/lib/format";

type KendalaRow = {
  id: number;
  orderId: number;
  qtyOrder: number;
  qtyLapor: number;
  status: string;
  catatanGudang: string | null;
  produkNama: string;
  satuan: string;
  tokoNama: string;
  createdAt: Date;
};

type Props = { items: KendalaRow[] };

type Draft = { qtyDriver: string; catatan: string };

export function KendalaDriverPanel({ items }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [drafts, setDrafts] = useState<Record<number, Draft>>(
    Object.fromEntries(items.map((it) => [it.id, { qtyDriver: String(it.qtyLapor), catatan: "" }])),
  );
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (items.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
        Tidak ada kendala yang perlu dikonfirmasi.
      </p>
    );
  }

  function setField(id: number, field: keyof Draft, value: string) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  function submit() {
    for (const it of items) {
      const qty = Number(drafts[it.id]?.qtyDriver ?? "");
      if (isNaN(qty) || qty < 0 || qty > it.qtyOrder) {
        setMsg({ ok: false, text: `Qty terkirim "${it.produkNama}" harus 0–${it.qtyOrder}.` });
        return;
      }
    }

    setMsg(null);
    start(async () => {
      const res = await adjustKendalaDriver(
        items.map((it) => ({
          kendalaItemId: it.id,
          qtyDriver: Number(drafts[it.id]?.qtyDriver ?? it.qtyLapor),
          catatan: drafts[it.id]?.catatan || undefined,
        })),
      );
      if (res.ok) {
        router.refresh();
      } else {
        setMsg({ ok: false, text: (res as { ok: false; error: string }).error });
      }
    });
  }

  // Group by orderId
  const byOrder = new Map<number, { tokoNama: string; createdAt: Date; rows: KendalaRow[] }>();
  for (const it of items) {
    const entry = byOrder.get(it.orderId) ?? { tokoNama: it.tokoNama, createdAt: it.createdAt, rows: [] };
    entry.rows.push(it);
    byOrder.set(it.orderId, entry);
  }

  return (
    <div className="space-y-3">
      {Array.from(byOrder.entries()).map(([orderId, group]) => (
        <div key={orderId} className="rounded-lg border bg-card">
          <div className="flex items-center gap-3 border-b px-4 py-3">
            <span className="tabular text-sm font-bold">INV-{orderId}</span>
            <span className="text-sm text-muted-foreground">{group.tokoNama}</span>
            <span className="ml-auto text-xs text-muted-foreground">{tglPendek(group.createdAt.toISOString())}</span>
          </div>
          <div className="space-y-2 px-4 py-3">
            {group.rows.map((it) => {
              const d = drafts[it.id];
              return (
                <div key={it.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{it.produkNama}</span>
                    <span className="text-xs text-muted-foreground">
                      Dipesan: {it.qtyOrder} {it.satuan} · Gudang kirim: {it.qtyLapor}
                    </span>
                  </div>
                  {it.catatanGudang && (
                    <p className="text-xs text-warning">Catatan gudang: {it.catatanGudang}</p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="mb-1 text-xs text-muted-foreground">Qty diterima toko</p>
                      <input
                        type="number"
                        min={0}
                        max={it.qtyOrder}
                        className="w-full rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        value={d?.qtyDriver ?? ""}
                        onChange={(e) => setField(it.id, "qtyDriver", e.target.value)}
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-xs text-muted-foreground">Catatan (opsional)</p>
                      <input
                        type="text"
                        className="w-full rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        placeholder="Keterangan…"
                        value={d?.catatan ?? ""}
                        onChange={(e) => setField(it.id, "catatan", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={submit} disabled={pending} className={btn.primary}>
          <Truck className="size-4" />
          {pending ? "Menyimpan…" : "Konfirmasi Pengiriman Kendala"}
        </button>
        {msg && (
          <p className={`text-sm font-semibold ${msg.ok ? "text-ok" : "text-critical"}`}>
            {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}
