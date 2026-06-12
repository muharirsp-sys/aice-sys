"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { btn } from "@/lib/ui";
import { laporKendalaItems } from "@/server/kendala-actions";
import type { OrderView } from "@/lib/order-status";

type Props = { orders: OrderView[]; collapsible?: boolean };

type ItemDraft = { selected: boolean; qtyLapor: string; catatan: string };

export function KendalaLaporPanel({ orders, collapsible }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(!collapsible);
  const [orderId, setOrderId] = useState<number | "">("");
  const [drafts, setDrafts] = useState<Record<number, ItemDraft>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const selectedOrder = orders.find((o) => o.id === orderId);

  function handleOrderChange(id: number | "") {
    setOrderId(id);
    setMsg(null);
    if (id === "") { setDrafts({}); return; }
    const o = orders.find((x) => x.id === id);
    if (!o) return;
    const init: Record<number, ItemDraft> = {};
    o.items.forEach((_, idx) => {
      init[idx] = { selected: false, qtyLapor: "", catatan: "" };
    });
    setDrafts(init);
  }

  function setField(idx: number, field: keyof ItemDraft, value: string | boolean) {
    setDrafts((prev) => ({ ...prev, [idx]: { ...prev[idx], [field]: value } }));
  }

  function submit() {
    if (!selectedOrder) return;
    const reportItems = selectedOrder.items
      .map((it, idx) => ({ it, draft: drafts[idx] }))
      .filter(({ draft }) => draft?.selected);

    if (!reportItems.length) {
      setMsg({ ok: false, text: "Pilih minimal 1 item yang kurang." });
      return;
    }

    for (const { it, draft } of reportItems) {
      const qty = Number(draft.qtyLapor);
      if (isNaN(qty) || qty < 0 || qty >= it.qty) {
        setMsg({ ok: false, text: `Qty lapor "${it.nama}" harus 0–${it.qty - 1}.` });
        return;
      }
    }

    setMsg(null);
    start(async () => {
      const res = await laporKendalaItems(
        selectedOrder.id,
        reportItems.map(({ it, draft }) => ({
          orderItemId: it.orderItemId,
          qtyLapor: Number(draft.qtyLapor),
          catatan: draft.catatan || undefined,
        })),
      );
      if (res.ok) {
        setOrderId("");
        setDrafts({});
        router.refresh();
        setMsg({ ok: true, text: "Kendala berhasil dilaporkan." });
      } else {
        setMsg({ ok: false, text: (res as { ok: false; error: string }).error });
      }
    });
  }

  const formContent = (
    <div className="space-y-4">
      <select
        className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        value={orderId}
        onChange={(e) => handleOrderChange(e.target.value === "" ? "" : Number(e.target.value))}
      >
        <option value="">— Pilih faktur yang ada kendala barang —</option>
        {orders.map((o) => (
          <option key={o.id} value={o.id}>
            Faktur #{o.id} · {o.tokoNama} ({o.items.length} item)
          </option>
        ))}
      </select>

      {selectedOrder && (
        <div className="space-y-2">
          {selectedOrder.items.map((it, idx) => {
            const d = drafts[idx];
            return (
              <div
                key={idx}
                className={`rounded-md border p-3 transition-colors ${d?.selected ? "border-warning bg-warning/5" : ""}`}
              >
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={d?.selected ?? false}
                    onChange={(e) => setField(idx, "selected", e.target.checked)}
                  />
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{it.nama}</span>
                      <span className="text-xs text-muted-foreground">
                        Qty order: {it.qty} {it.satuan}
                      </span>
                    </div>
                    {d?.selected && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="mb-1 text-xs text-muted-foreground">Qty yang bisa dikirim</p>
                          <input
                            type="number"
                            min={0}
                            max={it.qty - 1}
                            className="w-full rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                            placeholder={`0–${it.qty - 1}`}
                            value={d.qtyLapor}
                            onChange={(e) => setField(idx, "qtyLapor", e.target.value)}
                          />
                        </div>
                        <div>
                          <p className="mb-1 text-xs text-muted-foreground">Catatan (opsional)</p>
                          <input
                            type="text"
                            className="w-full rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                            placeholder="Alasan kurang…"
                            value={d.catatan}
                            onChange={(e) => setField(idx, "catatan", e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </label>
              </div>
            );
          })}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button onClick={submit} disabled={pending} className={btn.primary}>
              <AlertTriangle className="size-4" />
              {pending ? "Melaporkan…" : "Laporkan Kendala"}
            </button>
            {msg && (
              <p className={`text-sm font-semibold ${msg.ok ? "text-ok" : "text-critical"}`}>
                {msg.text}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );

  if (collapsible) {
    return (
      <div className="rounded-lg border">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <div>
            <span className="text-sm font-semibold">Lapor Barang Kurang (jika ada)</span>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Buka hanya jika stok fisik gudang kurang dari yang dipesan.
            </p>
          </div>
          {open ? <ChevronUp className="size-4 shrink-0" /> : <ChevronDown className="size-4 shrink-0" />}
        </button>
        {open && <div className="border-t px-4 pb-4 pt-3">{formContent}</div>}
      </div>
    );
  }

  return formContent;
}
