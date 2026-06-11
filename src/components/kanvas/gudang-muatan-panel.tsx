"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackageCheck, ClipboardCheck } from "lucide-react";
import { btn, input, label } from "@/lib/ui";
import { konfirmasiMuat, konfirmasiRekonsiliasi } from "@/server/kanvas-actions";

export type GudangTripView = {
  id: number;
  tujuan: string;
  status: "diajukan" | "rekonsiliasi";
  salesNama: string;
  items: {
    produkId: number;
    nama: string;
    satuan: string;
    qtyMuat: number;
    qtyTerjual: number;
    qtyKembali: number | null;
  }[];
};

// Panel gudang untuk modul kanvas: konfirmasi muat & verifikasi rekonsiliasi.
export function GudangMuatanPanel({ trips }: { trips: GudangTripView[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [catatan, setCatatan] = useState<Record<number, string>>({});
  const [err, setErr] = useState<string | null>(null);

  function muat(tripId: number) {
    setErr(null);
    startTransition(async () => {
      const r = await konfirmasiMuat(tripId);
      if (!r.ok) setErr(r.error);
      else router.refresh();
    });
  }
  function rekon(tripId: number) {
    setErr(null);
    startTransition(async () => {
      const r = await konfirmasiRekonsiliasi({ tripId, catatanSelisih: catatan[tripId] });
      if (!r.ok) setErr(r.error);
      else router.refresh();
    });
  }

  if (trips.length === 0) {
    return <p className="rounded-md border border-dashed p-6 text-center text-muted-foreground">Tidak ada trip kanvas menunggu gudang.</p>;
  }

  return (
    <div className="space-y-3">
      {err && <p className="rounded-md border border-l-4 border-l-critical bg-critical/10 p-3 text-sm font-semibold text-critical">{err}</p>}

      {trips.map((t) => {
        const adaSelisih = t.items.some((i) => i.qtyMuat - i.qtyTerjual - (i.qtyKembali ?? 0) !== 0);
        return (
          <div key={t.id} className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="tabular font-bold">Trip #{t.id}</span>
              <span className="font-semibold">{t.tujuan}</span>
              <span className="text-sm text-muted-foreground">Sales: {t.salesNama}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${t.status === "diajukan" ? "bg-muted text-muted-foreground" : "bg-accent/15 text-accent-foreground"}`}>
                {t.status === "diajukan" ? "Menunggu Muat" : "Rekonsiliasi"}
              </span>
            </div>

            {t.status === "diajukan" ? (
              <>
                <ul className="mt-2 text-sm text-muted-foreground">
                  {t.items.map((i) => (
                    <li key={i.produkId} className="tabular">{i.qtyMuat} {i.satuan} — {i.nama}</li>
                  ))}
                </ul>
                <div className="mt-3">
                  <button className={btn.primary} disabled={pending} onClick={() => muat(t.id)}>
                    <PackageCheck className="size-4" /> Konfirmasi Muat
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-1.5 pr-3 font-semibold">Produk</th>
                        <th className="py-1.5 pr-3 text-right font-semibold">Muat</th>
                        <th className="py-1.5 pr-3 text-right font-semibold">Terjual</th>
                        <th className="py-1.5 pr-3 text-right font-semibold">Kembali</th>
                        <th className="py-1.5 text-right font-semibold">Selisih</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.items.map((i) => {
                        const selisih = i.qtyMuat - i.qtyTerjual - (i.qtyKembali ?? 0);
                        return (
                          <tr key={i.produkId} className="border-b last:border-0">
                            <td className="py-1.5 pr-3">{i.nama} <span className="text-muted-foreground">/ {i.satuan}</span></td>
                            <td className="py-1.5 pr-3 text-right tabular">{i.qtyMuat}</td>
                            <td className="py-1.5 pr-3 text-right tabular">{i.qtyTerjual}</td>
                            <td className="py-1.5 pr-3 text-right tabular">{i.qtyKembali ?? 0}</td>
                            <td className={`py-1.5 text-right tabular font-bold ${selisih !== 0 ? "text-critical" : "text-ok"}`}>{selisih}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {adaSelisih && (
                  <div className="mt-3 max-w-md">
                    <label className={label} htmlFor={`catatan-${t.id}`}>Catatan selisih (wajib)</label>
                    <textarea id={`catatan-${t.id}`} rows={2} className={`${input} h-auto py-2`} value={catatan[t.id] ?? ""} onChange={(e) => setCatatan((c) => ({ ...c, [t.id]: e.target.value }))} placeholder="mis. 2 dus rusak di perjalanan." />
                  </div>
                )}
                <div className="mt-3">
                  <button className={btn.primary} disabled={pending || (adaSelisih && !(catatan[t.id] ?? "").trim())} onClick={() => rekon(t.id)}>
                    <ClipboardCheck className="size-4" /> Konfirmasi Rekonsiliasi Selesai
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
