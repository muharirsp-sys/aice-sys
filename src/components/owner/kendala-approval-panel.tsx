"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, XCircle } from "lucide-react";
import { btn } from "@/lib/ui";
import { approveKendala, tolakKendala } from "@/server/kendala-actions";
import { tglPendek } from "@/lib/format";

type KendalaRow = {
  id: number;
  orderId: number;
  qtyOrder: number;
  qtyLapor: number;
  qtyDriver: number | null;
  status: string;
  catatanGudang: string | null;
  catatanDriver: string | null;
  produkNama: string;
  satuan: string;
  tokoNama: string;
  cabangNama: string;
  gudangNama: string;
  createdAt: Date;
};

type Props = { items: KendalaRow[] };

export function KendalaApprovalPanel({ items }: Props) {
  const router = useRouter();
  const [pendingApprove, startApprove] = useTransition();
  const [pendingTolak, startTolak] = useTransition();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [tolakId, setTolakId] = useState<number | null>(null);
  const [tolakCatatan, setTolakCatatan] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (items.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
        Tidak ada kendala yang menunggu persetujuan.
      </p>
    );
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === items.length ? new Set() : new Set(items.map((it) => it.id)),
    );
  }

  function approve() {
    if (!selected.size) { setMsg({ ok: false, text: "Pilih minimal 1 item." }); return; }
    setMsg(null);
    startApprove(async () => {
      const res = await approveKendala(Array.from(selected));
      if (res.ok) {
        setSelected(new Set());
        router.refresh();
        setMsg({ ok: true, text: `${selected.size} item disetujui, nota diperbarui.` });
      } else {
        setMsg({ ok: false, text: (res as { ok: false; error: string }).error });
      }
    });
  }

  function submitTolak() {
    if (tolakId == null) return;
    startTolak(async () => {
      const res = await tolakKendala(tolakId, tolakCatatan);
      if (res.ok) {
        setTolakId(null);
        setTolakCatatan("");
        router.refresh();
      } else {
        setMsg({ ok: false, text: (res as { ok: false; error: string }).error });
      }
    });
  }

  const STATUS_CLS: Record<string, string> = {
    dilaporkan: "bg-warning/10 text-warning",
    disesuaikan: "bg-primary/10 text-primary",
  };

  return (
    <div className="space-y-3">
      {/* Tabel */}
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">
                <input type="checkbox" checked={selected.size === items.length} onChange={toggleAll} />
              </th>
              <th className="px-3 py-2 text-left">Nota / Produk</th>
              <th className="px-3 py-2 text-right">Dipesan</th>
              <th className="px-3 py-2 text-right">Gudang</th>
              <th className="px-3 py-2 text-right">Driver</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Catatan</th>
              <th className="px-3 py-2 text-right">Waktu</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((it) => (
              <tr key={it.id} className={selected.has(it.id) ? "bg-primary/5" : "bg-card"}>
                <td className="px-3 py-2">
                  <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggle(it.id)} />
                </td>
                <td className="px-3 py-2">
                  <p className="font-semibold">{it.produkNama}</p>
                  <p className="text-xs text-muted-foreground">
                    INV-{it.orderId} · {it.tokoNama} · {it.cabangNama}
                  </p>
                </td>
                <td className="px-3 py-2 text-right tabular">{it.qtyOrder} {it.satuan}</td>
                <td className="px-3 py-2 text-right tabular text-warning font-semibold">{it.qtyLapor}</td>
                <td className="px-3 py-2 text-right tabular">
                  {it.qtyDriver != null ? (
                    <span className="font-semibold text-primary">{it.qtyDriver}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_CLS[it.status] ?? ""}`}>
                    {it.status}
                  </span>
                </td>
                <td className="px-3 py-2 max-w-[200px]">
                  {it.catatanGudang && <p className="text-xs truncate">Gudang: {it.catatanGudang}</p>}
                  {it.catatanDriver && <p className="text-xs truncate text-primary">Driver: {it.catatanDriver}</p>}
                </td>
                <td className="px-3 py-2 text-right text-xs text-muted-foreground whitespace-nowrap">
                  {tglPendek(it.createdAt.toISOString())}
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => { setTolakId(it.id); setTolakCatatan(""); }}
                    className="inline-flex items-center gap-1 rounded border border-critical/40 px-2 py-1 text-xs text-critical hover:bg-critical/10"
                  >
                    <XCircle className="size-3" /> Tolak
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Batch approve */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={approve} disabled={pendingApprove || selected.size === 0} className={btn.primary}>
          <CheckCircle className="size-4" />
          {pendingApprove ? "Menyetujui…" : `Setujui (${selected.size})`}
        </button>
        {msg && (
          <p className={`text-sm font-semibold ${msg.ok ? "text-ok" : "text-critical"}`}>
            {msg.text}
          </p>
        )}
      </div>

      {/* Tolak modal */}
      {tolakId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg border bg-card p-5 shadow-xl space-y-4">
            <h3 className="font-semibold">Tolak Kendala #{tolakId}</h3>
            <textarea
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              rows={3}
              placeholder="Alasan penolakan (opsional)…"
              value={tolakCatatan}
              onChange={(e) => setTolakCatatan(e.target.value)}
            />
            <div className="flex gap-2">
              <button onClick={submitTolak} disabled={pendingTolak} className={btn.danger}>
                {pendingTolak ? "Menolak…" : "Tolak"}
              </button>
              <button onClick={() => setTolakId(null)} className={btn.outline}>
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
