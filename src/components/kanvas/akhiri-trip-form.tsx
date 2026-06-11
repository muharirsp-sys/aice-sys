"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Flag } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { btn, input, label } from "@/lib/ui";
import { akhiriTrip } from "@/server/kanvas-actions";

type ItemSisa = { produkId: number; nama: string; satuan: string; sisa: number };

// Sales mengakhiri trip: mengajukan qty barang yang dibawa kembali ke gudang.
export function AkhiriTripForm({ tripId, items }: { tripId: number; items: ItemSisa[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [kembali, setKembali] = useState<Record<number, number>>(() =>
    Object.fromEntries(items.map((i) => [i.produkId, i.sisa])),
  );
  const [err, setErr] = useState<string | null>(null);

  const invalid = items.some((i) => {
    const q = kembali[i.produkId];
    return !Number.isInteger(q) || q < 0 || q > i.sisa;
  });

  function submit() {
    setErr(null);
    startTransition(async () => {
      const res = await akhiriTrip({
        tripId,
        kembali: items.map((i) => ({ produkId: i.produkId, qtyKembali: kembali[i.produkId] ?? 0 })),
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <>
      <button className={btn.accent} onClick={() => setOpen(true)}>
        <Flag className="size-4" /> Akhiri Trip
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Akhiri Trip #${tripId} — Barang Kembali`}>
        <p className="mb-3 text-sm text-muted-foreground">
          Isi jumlah barang yang dibawa kembali ke gudang. Idealnya sama dengan sisa muatan.
        </p>
        <div className="space-y-3">
          {items.map((i) => (
            <div key={i.produkId} className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <label className={label}>{i.nama}</label>
                <p className="text-xs text-muted-foreground">sisa muatan: {i.sisa} {i.satuan}</p>
              </div>
              <input
                type="number"
                min={0}
                max={i.sisa}
                className={`${input} w-24 tabular ${(kembali[i.produkId] ?? 0) > i.sisa ? "border-critical text-critical" : ""}`}
                value={kembali[i.produkId] ?? 0}
                onChange={(e) => { setKembali((k) => ({ ...k, [i.produkId]: Math.max(0, Number(e.target.value)) })); setErr(null); }}
              />
            </div>
          ))}
        </div>
        {err && <p className="mt-3 rounded-md bg-critical/10 p-2 text-sm font-semibold text-critical">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button className={btn.outline} onClick={() => setOpen(false)}>Batal</button>
          <button className={btn.accent} disabled={invalid || pending} onClick={submit}>
            {pending ? "Mengirim…" : "Ajukan Rekonsiliasi"}
          </button>
        </div>
      </Dialog>
    </>
  );
}
