"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PackageCheck, TriangleAlert, ClipboardList } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { btn, input, label } from "@/lib/ui";
import type { OrderView } from "@/lib/order-status";
import { confirmReady, reportShortage } from "@/server/actions";

export function GudangList({ orders }: { orders: OrderView[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [issueId, setIssueId] = useState<number | null>(null);
  const [deskripsi, setDeskripsi] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  function siap(id: number) {
    setErr(null);
    startTransition(async () => {
      const r = await confirmReady(id);
      if (!r.ok) setErr(r.error);
      else router.refresh();
    });
  }
  function submitIssue() {
    const id = issueId;
    if (!id) return;
    startTransition(async () => {
      const r = await reportShortage(id, deskripsi);
      if (!r.ok) setErr(r.error);
      else {
        setOkMsg(`Kendala Order #${id} dilaporkan ke Owner.`);
        setIssueId(null);
        setDeskripsi("");
        router.refresh();
      }
    });
  }

  if (orders.length === 0) {
    return <p className="rounded-md border border-dashed p-6 text-center text-muted-foreground">Tidak ada pick list menunggu persiapan.</p>;
  }

  return (
    <>
      {err && <p className="mb-3 rounded-md border border-l-4 border-l-critical bg-critical/10 p-3 text-sm font-semibold text-critical">{err}</p>}
      {okMsg && <p className="mb-3 rounded-md border border-l-4 border-l-accent bg-accent/10 p-3 text-sm font-semibold">{okMsg}</p>}

      <div className="space-y-3">
        {orders.map((o) => (
          <div key={o.id} className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="tabular font-bold">#{o.id}</span>
              <span className="font-semibold">{o.tokoNama}</span>
            </div>
            <ul className="mt-2 text-sm text-muted-foreground">
              {o.items.map((i) => (
                <li key={i.produkId} className="tabular">{i.qty} {i.satuan} — {i.nama}</li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className={btn.primary} disabled={pending} onClick={() => siap(o.id)}>
                <PackageCheck className="size-4" /> Konfirmasi Siap
              </button>
              <button className={btn.accent} disabled={pending} onClick={() => setIssueId(o.id)}>
                <TriangleAlert className="size-4" /> Laporkan Kendala
              </button>
              <a href={`/pdf/picklist/${o.id}`} target="_blank" rel="noopener noreferrer" className={btn.ghost}>
                <ClipboardList className="size-4" /> Pick List PDF
              </a>
              <Link href={`/order/${o.id}`} className={btn.ghost}>Detail</Link>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={issueId != null} onClose={() => setIssueId(null)} title={`Laporkan Kendala — Order #${issueId}`}>
        <label className={label} htmlFor="ket">Deskripsi barang kurang / kendala</label>
        <textarea id="ket" rows={3} className={`${input} h-auto py-2`} value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)} placeholder="mis. Indomie Goreng kurang 12 dus." />
        <div className="mt-4 flex justify-end gap-2">
          <button className={btn.outline} onClick={() => setIssueId(null)}>Batal</button>
          <button className={btn.accent} disabled={!deskripsi.trim() || pending} onClick={submitIssue}>Kirim ke Dashboard Owner</button>
        </div>
      </Dialog>
    </>
  );
}
