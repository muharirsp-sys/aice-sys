"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Truck } from "lucide-react";
import { btn, input, label } from "@/lib/ui";
import { createTrip } from "@/server/kanvas-actions";

type Produk = { id: number; nama: string; satuan: string };
type MuatLine = { key: number; produkId: number; qtyMuat: number };

let seq = 1;

// Form pengajuan trip kanvas: tujuan + daftar muatan kendaraan.
export function TripForm({ produks }: { produks: Produk[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tujuan, setTujuan] = useState("");
  const [lines, setLines] = useState<MuatLine[]>(() =>
    produks[0] ? [{ key: seq++, produkId: produks[0].id, qtyMuat: 1 }] : [],
  );
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function update(key: number, patch: Partial<MuatLine>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setMsg(null);
  }

  const dupe = new Set(lines.map((l) => l.produkId)).size !== lines.length;
  const bisaSimpan = tujuan.trim().length > 0 && lines.length > 0 && !dupe && !pending;

  function simpan() {
    setMsg(null);
    startTransition(async () => {
      const res = await createTrip({
        tujuan,
        items: lines.map((l) => ({ produkId: l.produkId, qtyMuat: l.qtyMuat })),
      });
      if (res.ok) {
        setMsg({ ok: true, text: `Trip #${res.tripId} diajukan — menunggu konfirmasi muat Gudang.` });
        setTujuan("");
        setLines(produks[0] ? [{ key: seq++, produkId: produks[0].id, qtyMuat: 1 }] : []);
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-5 max-w-sm">
        <label className={label} htmlFor="tujuan">Tujuan Trip</label>
        <input id="tujuan" className={input} value={tujuan} onChange={(e) => { setTujuan(e.target.value); setMsg(null); }} placeholder="mis. Luwuk – Banggai" />
      </div>

      <div className="space-y-3">
        {lines.map((l) => (
          <div key={l.key} className="grid grid-cols-[1fr_auto_auto] items-end gap-3 rounded-md border p-3">
            <div>
              <label className={label}>Produk</label>
              <select className={input} value={l.produkId} onChange={(e) => update(l.key, { produkId: Number(e.target.value) })}>
                {produks.map((p) => (
                  <option key={p.id} value={p.id}>{p.nama} ({p.satuan})</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Qty Muat</label>
              <input type="number" min={1} className={`${input} w-24 tabular`} value={l.qtyMuat} onChange={(e) => update(l.key, { qtyMuat: Math.max(1, Number(e.target.value)) })} />
            </div>
            <button onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Hapus item" className="grid size-10 place-items-center rounded-md text-muted-foreground hover:bg-muted">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
      {dupe && <p className="mt-2 text-xs font-semibold text-critical">Produk muatan tidak boleh duplikat.</p>}

      <button onClick={() => setLines((ls) => [...ls, { key: seq++, produkId: produks[0]?.id ?? 0, qtyMuat: 1 }])} className={`${btn.outline} mt-3`}>
        <Plus className="size-4" /> Tambah Produk
      </button>

      <div className="mt-5 flex justify-end border-t pt-4">
        <button disabled={!bisaSimpan} onClick={simpan} className={btn.primary}>
          <Truck className="size-4" /> {pending ? "Mengajukan…" : "Ajukan Trip"}
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
