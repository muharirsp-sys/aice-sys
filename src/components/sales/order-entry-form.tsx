"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Check } from "lucide-react";
import { rupiah } from "@/lib/format";
import { subtotalItem } from "@/lib/pricing-calc";
import { btn, input, label } from "@/lib/ui";
import { createOrder } from "@/server/actions";

type Toko = { id: number; nama: string };
type Produk = { id: number; nama: string; satuan: string; harga: number };
type Diskon = {
  tokoId: number;
  produkId: number;
  batasPersen: number;
  batasRupiah: number;
};

type Line = { key: number; produkId: number; qty: number; diskonPersen: number; diskonRupiah: number };

let seq = 1;

export function OrderEntryForm({
  tokos,
  produks,
  diskon,
}: {
  tokos: Toko[];
  produks: Produk[];
  diskon: Diskon[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tokoId, setTokoId] = useState(tokos[0]?.id ?? 0);
  const [lines, setLines] = useState<Line[]>(() =>
    produks[0] ? [{ key: seq++, produkId: produks[0].id, qty: 1, diskonPersen: 0, diskonRupiah: 0 }] : [],
  );
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const hargaOf = (id: number) => produks.find((p) => p.id === id)?.harga ?? 0;
  const caps = (pid: number) =>
    diskon.find((d) => d.tokoId === tokoId && d.produkId === pid) ?? {
      batasPersen: 0,
      batasRupiah: 0,
    };

  function update(key: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setMsg(null);
  }
  function lineInvalid(l: Line) {
    const c = caps(l.produkId);
    return l.diskonPersen > c.batasPersen || l.diskonRupiah > c.batasRupiah;
  }
  function sub(l: Line) {
    return subtotalItem({ qty: l.qty, hargaSatuan: hargaOf(l.produkId), diskonPersen: l.diskonPersen, diskonRupiah: l.diskonRupiah });
  }

  const total = lines.reduce((s, l) => s + sub(l), 0);
  const bisaSimpan = lines.length > 0 && !lines.some(lineInvalid) && tokoId > 0 && !pending;

  function simpan() {
    setMsg(null);
    startTransition(async () => {
      const res = await createOrder({
        tokoId,
        items: lines.map((l) => ({
          produkId: l.produkId,
          qty: l.qty,
          diskonPersen: l.diskonPersen,
          diskonRupiah: l.diskonRupiah,
        })),
      });
      if (res.ok) {
        setMsg({ ok: true, text: `Pesanan #${res.orderId} disimpan — status Pending. Menunggu persetujuan Admin.` });
        setLines(produks[0] ? [{ key: seq++, produkId: produks[0].id, qty: 1, diskonPersen: 0, diskonRupiah: 0 }] : []);
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-5 max-w-sm">
        <label className={label} htmlFor="toko">Toko</label>
        <select id="toko" className={input} value={tokoId} onChange={(e) => setTokoId(Number(e.target.value))}>
          {tokos.map((t) => (
            <option key={t.id} value={t.id}>{t.nama}</option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {lines.map((l) => {
          const c = caps(l.produkId);
          const overP = l.diskonPersen > c.batasPersen;
          const overR = l.diskonRupiah > c.batasRupiah;
          return (
            <div key={l.key} className="grid grid-cols-2 gap-3 rounded-md border p-3 sm:grid-cols-[1fr_auto_auto_auto_auto_auto] sm:items-end">
              <div className="col-span-2 sm:col-span-1">
                <label className={label}>Produk</label>
                <select className={input} value={l.produkId} onChange={(e) => update(l.key, { produkId: Number(e.target.value) })}>
                  {produks.map((p) => (
                    <option key={p.id} value={p.id}>{p.nama} ({p.satuan})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label}>Qty</label>
                <input type="number" min={1} className={`${input} w-20 tabular`} value={l.qty} onChange={(e) => update(l.key, { qty: Math.max(1, Number(e.target.value)) })} />
              </div>
              <div>
                <label className={label}>Disk %</label>
                <input type="number" min={0} className={`${input} w-20 tabular ${overP ? "border-critical text-critical" : ""}`} value={l.diskonPersen} onChange={(e) => update(l.key, { diskonPersen: Math.max(0, Number(e.target.value)) })} />
              </div>
              <div>
                <label className={label}>Disk Rp</label>
                <input type="number" min={0} className={`${input} w-24 tabular ${overR ? "border-critical text-critical" : ""}`} value={l.diskonRupiah} onChange={(e) => update(l.key, { diskonRupiah: Math.max(0, Number(e.target.value)) })} />
              </div>
              <div className="text-right">
                <label className={label}>Subtotal</label>
                <p className="tabular py-2 font-bold">{rupiah(sub(l))}</p>
              </div>
              <button onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Hapus item" className="grid size-10 place-items-center self-end rounded-md text-muted-foreground hover:bg-muted">
                <Trash2 className="size-4" />
              </button>
              {(overP || overR) && (
                <p className="col-span-full text-xs font-semibold text-critical">
                  Diskon melebihi batas toko (maks {c.batasPersen}% / {rupiah(c.batasRupiah)}/unit).
                </p>
              )}
            </div>
          );
        })}
      </div>

      <button onClick={() => setLines((ls) => [...ls, { key: seq++, produkId: produks[0]?.id ?? 0, qty: 1, diskonPersen: 0, diskonRupiah: 0 }])} className={`${btn.outline} mt-3`}>
        <Plus className="size-4" /> Tambah Item
      </button>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div>
          <p className="text-sm text-muted-foreground">Total Pesanan</p>
          <p className="tabular text-3xl font-extrabold tracking-tight">{rupiah(total)}</p>
        </div>
        <button disabled={!bisaSimpan} onClick={simpan} className={btn.primary}>
          <Check className="size-4" /> {pending ? "Menyimpan…" : "Simpan Pesanan"}
        </button>
      </div>

      {msg && (
        <p className={`mt-3 rounded-md border border-l-4 p-3 text-sm font-semibold ${msg.ok ? "border-l-ok bg-ok/10 text-ok" : "border-l-critical bg-critical/10 text-critical"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
