"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Receipt, Scale, Check, Upload } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { rupiah } from "@/lib/format";
import { totalItems } from "@/lib/pricing-calc";
import { btn, input, label } from "@/lib/ui";
import type { OrderView } from "@/lib/order-status";
import { validateBukti } from "@/lib/upload-constants";
import { compressImage } from "@/lib/compress-image";
import { recordPayment, reportSelisih } from "@/server/actions";

type Row = { metode: string; jumlah: number; file: File | null };

export function IncasoList({ orders }: { orders: OrderView[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [row, setRow] = useState<Record<number, Row>>(
    Object.fromEntries(orders.map((o) => [o.id, { metode: "tunai", jumlah: totalItems(o.items), file: null }])),
  );
  const [selisihId, setSelisihId] = useState<number | null>(null);
  const [keterangan, setKeterangan] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function patch(id: number, p: Partial<Row>) {
    setRow((r) => ({ ...r, [id]: { ...r[id], ...p } }));
  }

  function bayar(id: number) {
    const r = row[id];
    if (!r?.file) return setErr("Bukti pembayaran wajib diunggah.");
    setErr(null);
    const fd = new FormData();
    fd.append("orderId", String(id));
    fd.append("metode", r.metode);
    fd.append("jumlah", String(r.jumlah));
    fd.append("bukti", r.file);
    startTransition(async () => {
      const res = await recordPayment(fd);
      if (!res.ok) setErr(res.error);
      else router.refresh();
    });
  }

  function kirimSelisih() {
    const id = selisihId;
    if (!id) return;
    startTransition(async () => {
      const res = await reportSelisih(id, keterangan);
      if (!res.ok) setErr(res.error);
      else {
        setSelisihId(null);
        setKeterangan("");
        router.refresh();
      }
    });
  }

  if (orders.length === 0) {
    return <p className="rounded-md border border-dashed p-6 text-center text-muted-foreground">Tidak ada order menunggu pembayaran.</p>;
  }

  return (
    <>
      {err && <p className="mb-3 rounded-md border border-l-4 border-l-critical bg-critical/10 p-3 text-sm font-semibold text-critical">{err}</p>}
      <div className="space-y-3">
        {orders.map((o) => {
          const total = totalItems(o.items);
          const r = row[o.id];
          const selisih = (r?.jumlah ?? total) - total;
          return (
            <div key={o.id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="tabular font-bold">#{o.id}</span>
                <span className="font-semibold">{o.tokoNama}</span>
                <span className="ml-auto text-sm text-muted-foreground">
                  Tagihan <span className="tabular font-bold text-foreground">{rupiah(total)}</span>
                </span>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-4 sm:items-end">
                <div>
                  <label className={label}>Metode</label>
                  <select className={input} value={r?.metode} onChange={(e) => patch(o.id, { metode: e.target.value })}>
                    <option value="tunai">Tunai</option>
                    <option value="transfer">Transfer</option>
                  </select>
                </div>
                <div>
                  <label className={label}>Jumlah diterima</label>
                  <input type="number" className={`${input} tabular ${selisih !== 0 ? "border-warning" : ""}`} value={r?.jumlah ?? 0} onChange={(e) => patch(o.id, { jumlah: Number(e.target.value) })} />
                </div>
                <div>
                  <label className={label}>Bukti bayar</label>
                  <label className={`${btn.outline} w-full cursor-pointer`}>
                    <Upload className="size-4" />
                    {r?.file ? "Terunggah" : "Unggah"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const raw = e.target.files?.[0] ?? null;
                        if (!raw) return patch(o.id, { file: null });
                        if (!raw.type.startsWith("image/")) {
                          setErr("Tipe file harus gambar.");
                          e.target.value = "";
                          return;
                        }
                        const f = await compressImage(raw); // kompres sebelum unggah
                        const v = validateBukti(f);
                        if (v) {
                          setErr(v);
                          patch(o.id, { file: null });
                          e.target.value = "";
                          return;
                        }
                        setErr(null);
                        patch(o.id, { file: f });
                      }}
                    />
                  </label>
                </div>
                <div className="text-right">
                  <label className={label}>Selisih</label>
                  <p className={`tabular py-2 font-bold ${selisih === 0 ? "text-ok" : "text-warning-foreground"}`}>
                    {selisih === 0 ? "Balance" : rupiah(selisih)}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button className={btn.primary} disabled={pending || !r?.file} onClick={() => bayar(o.id)}>
                  <Check className="size-4" /> Catat Pembayaran
                </button>
                <button
                  className={btn.accent}
                  disabled={pending || selisih === 0}
                  onClick={() => {
                    setSelisihId(o.id);
                    setKeterangan(`Selisih ${rupiah(selisih)} dari tagihan ${rupiah(total)}.`);
                  }}
                >
                  <Scale className="size-4" /> Laporkan Selisih
                </button>
                <a href={`/pdf/kwitansi/${o.id}`} target="_blank" rel="noopener noreferrer" className={btn.ghost}>
                  <Receipt className="size-4" /> Kwitansi PDF
                </a>
                <Link href={`/order/${o.id}`} className={btn.ghost}>Detail</Link>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={selisihId != null} onClose={() => setSelisihId(null)} title={`Laporkan Selisih — Order #${selisihId}`}>
        <label className={label} htmlFor="ket">Keterangan selisih</label>
        <textarea id="ket" rows={3} className={`${input} h-auto py-2`} value={keterangan} onChange={(e) => setKeterangan(e.target.value)} />
        <div className="mt-4 flex justify-end gap-2">
          <button className={btn.outline} onClick={() => setSelisihId(null)}>Batal</button>
          <button className={btn.accent} disabled={!keterangan.trim() || pending} onClick={kirimSelisih}>Kirim ke Dashboard Owner</button>
        </div>
      </Dialog>
    </>
  );
}
