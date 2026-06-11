"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { rupiah } from "@/lib/format";
import { btn, input, label } from "@/lib/ui";
import { recordKanvasPayment } from "@/server/kanvas-actions";

// Sales mencatat pembayaran tunai/transfer di tempat untuk faktur kanvas.
export function CatatBayarKanvas({ orderId, total }: { orderId: number; total: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [jumlah, setJumlah] = useState(total);
  const [metode, setMetode] = useState("tunai");
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    setErr(null);
    startTransition(async () => {
      const res = await recordKanvasPayment({ orderId, jumlah, metode });
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
      <button className={btn.outline} onClick={() => setOpen(true)}>
        <Banknote className="size-4" /> Catat Bayar
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Pembayaran Faktur INV-${orderId}`}>
        <div className="space-y-3">
          <div>
            <label className={label} htmlFor="jumlah-bayar">Jumlah (total faktur {rupiah(total)})</label>
            <input id="jumlah-bayar" type="number" min={1} className={`${input} tabular`} value={jumlah} onChange={(e) => { setJumlah(Math.max(0, Number(e.target.value))); setErr(null); }} />
          </div>
          <div>
            <label className={label} htmlFor="metode-bayar">Metode</label>
            <select id="metode-bayar" className={input} value={metode} onChange={(e) => setMetode(e.target.value)}>
              <option value="tunai">Tunai</option>
              <option value="transfer">Transfer</option>
            </select>
          </div>
        </div>
        {err && <p className="mt-3 rounded-md bg-critical/10 p-2 text-sm font-semibold text-critical">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button className={btn.outline} onClick={() => setOpen(false)}>Batal</button>
          <button className={btn.primary} disabled={jumlah <= 0 || pending} onClick={submit}>
            {pending ? "Menyimpan…" : "Simpan Pembayaran"}
          </button>
        </div>
      </Dialog>
    </>
  );
}
