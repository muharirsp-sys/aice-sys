"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { rupiah, tglPendek } from "@/lib/format";
import { totalItems } from "@/lib/pricing-calc";
import { btn } from "@/lib/ui";
import type { OrderView } from "@/lib/order-status";
import { createTandaTerima } from "@/server/tanda-terima-actions";

type TTRow = {
  id: number;
  tanggal: string;
  status: string;
  adminNama: string;
  jumlahNota: number;
  tidakSesuaiCount: number;
};

export function TandaTerimaAdminPanel({
  availableOrders,
  recentTTs,
}: {
  availableOrders: OrderView[];
  recentTTs: TTRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(
      selected.size === availableOrders.length
        ? new Set()
        : new Set(availableOrders.map((o) => o.id)),
    );
  }

  function buatTandaTerima() {
    setMsg(null);
    const ids = [...selected];
    start(async () => {
      const res = await createTandaTerima(ids);
      if (res.ok && res.id) {
        setSelected(new Set());
        router.refresh();
        window.open(`/pdf/tanda-terima/${res.id}`, "_blank");
        setMsg({ ok: true, text: `TT-${String(res.id).padStart(5, "0")} dibuat. Serahkan ke gudang untuk konfirmasi barang.` });
      } else {
        setMsg({ ok: false, text: (res as { ok: false; error: string }).error });
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Faktur Siap Tanda Terima ({availableOrders.length})
          </h2>
          {availableOrders.length > 0 && (
            <button className={btn.ghost} onClick={toggleAll}>
              {selected.size === availableOrders.length ? "Batal Semua" : "Pilih Semua"}
            </button>
          )}
        </div>

        {availableOrders.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            Semua faktur approved sudah masuk tanda terima.
          </p>
        ) : (
          <div className="space-y-1">
            {availableOrders.map((o) => (
              <label
                key={o.id}
                className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 hover:bg-muted"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={selected.has(o.id)}
                  onChange={() => toggle(o.id)}
                />
                <span className="w-20 tabular text-sm font-bold">INV-{o.id}</span>
                <span className="flex-1 text-sm">{o.tokoNama}</span>
                <span className="tabular text-sm font-semibold">{rupiah(totalItems(o.items))}</span>
                <span className="text-xs text-muted-foreground">{tglPendek(o.tanggal)}</span>
              </label>
            ))}
          </div>
        )}

        {availableOrders.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              disabled={selected.size === 0 || pending}
              onClick={buatTandaTerima}
              className={btn.primary}
            >
              <Plus className="size-4" />
              {pending ? "Membuat…" : `Buat Tanda Terima (${selected.size} faktur)`}
            </button>
            {msg && (
              <p className={`text-sm font-semibold ${msg.ok ? "text-ok" : "text-critical"}`}>
                {msg.text}
              </p>
            )}
          </div>
        )}
      </section>

      {recentTTs.length > 0 && (
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Tanda Terima Terbaru
          </h2>
          <div className="space-y-1">
            {recentTTs.map((tt) => (
              <div
                key={tt.id}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="tabular text-sm font-bold">
                    TT-{String(tt.id).padStart(5, "0")}
                  </span>
                  <span className="text-xs text-muted-foreground">{tglPendek(tt.tanggal)}</span>
                  <span className="text-xs text-muted-foreground">{tt.jumlahNota} faktur</span>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      tt.status === "dikonfirmasi"
                        ? "bg-ok/15 text-ok"
                        : "bg-primary/15 text-primary"
                    }`}
                  >
                    {tt.status === "dikonfirmasi" ? "Dikonfirmasi Gudang" : "Menunggu Gudang"}
                  </span>
                  {tt.tidakSesuaiCount > 0 && (
                    <span className="inline-flex rounded-full bg-critical/15 px-2 py-0.5 text-xs font-semibold text-critical">
                      {tt.tidakSesuaiCount} tidak sesuai
                    </span>
                  )}
                </div>
                <a
                  href={`/pdf/tanda-terima/${tt.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={btn.outline}
                >
                  <FileText className="size-4" /> Cetak
                </a>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
