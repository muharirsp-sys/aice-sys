"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, CheckCheck, X, FileText, ClipboardList } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { rupiah } from "@/lib/format";
import { totalItems } from "@/lib/pricing-calc";
import { btn, input, label } from "@/lib/ui";
import type { OrderView } from "@/lib/order-status";
import { approveOrder, approveAllOrders, rejectOrder } from "@/server/actions";

export function ApprovalList({ orders }: { orders: OrderView[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [alasan, setAlasan] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [approvedBanner, setApprovedBanner] = useState(false);

  function approve(id: number) {
    setErr(null);
    startTransition(async () => {
      const r = await approveOrder(id);
      if (!r.ok) setErr(r.error);
      else { setApprovedBanner(true); router.refresh(); }
    });
  }
  function approveAll() {
    setErr(null);
    startTransition(async () => {
      const r = await approveAllOrders(orders.map((o) => o.id));
      if (!r.ok) setErr(r.error);
      else { setApprovedBanner(true); router.refresh(); }
    });
  }
  function confirmReject() {
    const id = rejectId;
    if (!id) return;
    startTransition(async () => {
      const r = await rejectOrder(id, alasan);
      if (!r.ok) setErr(r.error);
      else {
        setRejectId(null);
        setAlasan("");
        router.refresh();
      }
    });
  }

  if (orders.length === 0) {
    return (
      <>
        {approvedBanner && (
          <div className="mb-3 rounded-md border border-ok bg-ok/10 p-3 text-sm font-semibold text-ok">
            Disetujui. Sekarang cetak fakturnya di bagian &ldquo;Cetak Faktur&rdquo; di bawah.
          </div>
        )}
        <p className="rounded-md border border-dashed p-6 text-center text-muted-foreground">Tidak ada order menunggu persetujuan.</p>
      </>
    );
  }

  return (
    <>
      {approvedBanner && (
        <div className="mb-3 rounded-md border border-ok bg-ok/10 p-3 text-sm font-semibold text-ok">
          Disetujui. Sekarang cetak fakturnya di bagian &ldquo;Cetak Faktur&rdquo; di bawah.
        </div>
      )}
      {err && (
        <p className="mb-3 rounded-md border border-l-4 border-l-critical bg-critical/10 p-3 text-sm font-semibold text-critical">{err}</p>
      )}
      {orders.length > 1 && (
        <div className="mb-3 flex justify-end">
          <button className={btn.primary} disabled={pending} onClick={approveAll}>
            <CheckCheck className="size-4" /> Setujui Semua ({orders.length})
          </button>
        </div>
      )}
      <div className="space-y-3">
        {orders.map((o) => (
          <div key={o.id} className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="tabular font-bold">#{o.id}</span>
              <span className="font-semibold">{o.tokoNama}</span>
              <span className="ml-auto tabular text-lg font-extrabold">{rupiah(totalItems(o.items))}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {o.salesNama} · {o.items.map((i) => `${i.qty} ${i.satuan} ${i.nama}`).join(" · ")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className={btn.primary} disabled={pending} onClick={() => approve(o.id)}>
                <Check className="size-4" /> Setujui
              </button>
              <button className={btn.outline} disabled={pending} onClick={() => setRejectId(o.id)}>
                <X className="size-4" /> Tolak
              </button>
              <a href={`/pdf/faktur/${o.id}`} target="_blank" rel="noopener noreferrer" className={btn.ghost}>
                <FileText className="size-4" /> Faktur PDF
              </a>
              <a href={`/pdf/picklist/${o.id}`} target="_blank" rel="noopener noreferrer" className={btn.ghost}>
                <ClipboardList className="size-4" /> Pick List PDF
              </a>
              <Link href={`/order/${o.id}`} className={btn.ghost}>Detail</Link>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={rejectId != null} onClose={() => setRejectId(null)} title={`Tolak Order #${rejectId}`}>
        <label className={label} htmlFor="alasan">Alasan penolakan</label>
        <textarea id="alasan" rows={3} className={`${input} h-auto py-2`} value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="mis. Diskon melebihi batas, stok tidak tersedia…" />
        <div className="mt-4 flex justify-end gap-2">
          <button className={btn.outline} onClick={() => setRejectId(null)}>Batal</button>
          <button className={btn.danger} disabled={!alasan.trim() || pending} onClick={confirmReject}>Tolak Order</button>
        </div>
      </Dialog>
    </>
  );
}
