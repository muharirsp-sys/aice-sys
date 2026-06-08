"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Camera, MapPin, Truck } from "lucide-react";
import { btn, input, label } from "@/lib/ui";
import type { OrderView } from "@/lib/order-status";
import { validateBukti } from "@/lib/upload-constants";
import { compressImage } from "@/lib/compress-image";
import { markDelivered } from "@/server/actions";

type Row = { file: File | null; preview: string; gps: string };

export function DeliveryList({ orders }: { orders: OrderView[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<Record<number, Row>>(
    Object.fromEntries(orders.map((o) => [o.id, { file: null, preview: "", gps: "-7.2575, 112.7521" }])),
  );
  const [err, setErr] = useState<string | null>(null);

  function patch(id: number, p: Partial<Row>) {
    setState((s) => ({ ...s, [id]: { ...s[id], ...p } }));
  }

  function kirim(id: number) {
    const r = state[id];
    if (!r?.file) return setErr("Foto bukti terima wajib diunggah.");
    setErr(null);
    const fd = new FormData();
    fd.append("orderId", String(id));
    fd.append("gps", r.gps);
    fd.append("bukti", r.file);
    startTransition(async () => {
      const res = await markDelivered(fd);
      if (!res.ok) setErr(res.error);
      else router.refresh();
    });
  }

  if (orders.length === 0) {
    return <p className="rounded-md border border-dashed p-6 text-center text-muted-foreground">Tidak ada order siap kirim.</p>;
  }

  return (
    <>
      {err && <p className="mb-3 rounded-md border border-l-4 border-l-critical bg-critical/10 p-3 text-sm font-semibold text-critical">{err}</p>}
      <div className="space-y-3">
        {orders.map((o) => {
          const r = state[o.id];
          const adaFoto = !!r?.file;
          return (
            <div key={o.id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="tabular font-bold">#{o.id}</span>
                <span className="font-semibold">{o.tokoNama}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{o.tokoAlamat}</p>

              <div className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr] sm:items-start">
                <div className="flex items-start gap-3">
                  <div className="grid size-20 place-items-center overflow-hidden rounded-md border bg-muted">
                    {adaFoto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.preview} alt="Bukti terima" className="size-full object-cover" />
                    ) : (
                      <Camera className="size-6 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <label className={label}>Foto bukti terima</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const raw = e.target.files?.[0] ?? null;
                        if (!raw) return patch(o.id, { file: null, preview: "" });
                        if (!raw.type.startsWith("image/")) {
                          setErr("Tipe file harus gambar.");
                          e.target.value = "";
                          return;
                        }
                        const f = await compressImage(raw); // kompres sebelum unggah
                        const v = validateBukti(f);
                        if (v) {
                          setErr(v);
                          patch(o.id, { file: null, preview: "" });
                          e.target.value = "";
                          return;
                        }
                        setErr(null);
                        patch(o.id, { file: f, preview: URL.createObjectURL(f) });
                      }}
                      className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-semibold"
                    />
                    <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3.5" /> GPS
                    </p>
                    <input className={`${input} mt-1 h-9 w-48 tabular text-sm`} value={r?.gps ?? ""} onChange={(e) => patch(o.id, { gps: e.target.value })} />
                  </div>
                </div>
                <div className="flex items-end gap-2 sm:justify-end">
                  <Link href={`/order/${o.id}`} className={btn.ghost}>Detail</Link>
                  <button className={btn.primary} disabled={pending || !adaFoto} onClick={() => kirim(o.id)}>
                    <Truck className="size-4" /> {pending ? "Memproses…" : "Tandai Terkirim"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
