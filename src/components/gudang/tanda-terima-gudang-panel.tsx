"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, XCircle, ChevronDown, ChevronUp, Paperclip, ClipboardList } from "lucide-react";
import { tglPendek } from "@/lib/format";
import { btn } from "@/lib/ui";
import { konfirmasiTandaTerima } from "@/server/tanda-terima-actions";

type OrderItem = { orderItemId: number; nama: string; satuan: string; qty: number };

type TTItem = {
  id: number;
  orderId: number;
  status: string;
  catatan: string | null;
  tokoNama: string;
  orderItems: OrderItem[];
};

type PendingTT = {
  id: number;
  tanggal: string;
  adminNama: string;
  items: TTItem[];
};

type ItemDraft = {
  orderId: number;
  status: "sesuai" | "tidak_sesuai";
  catatan: string;
  qtyItems: Record<number, number>;
};

function TandaTerimaCard({ tt }: { tt: PendingTT }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(true);
  const [drafts, setDrafts] = useState<Record<number, ItemDraft>>(
    Object.fromEntries(
      tt.items.map((it) => [
        it.orderId,
        {
          orderId: it.orderId,
          status: "sesuai" as const,
          catatan: "",
          qtyItems: Object.fromEntries(it.orderItems.map((oi) => [oi.orderItemId, oi.qty])),
        },
      ]),
    ),
  );
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  function setStatus(orderId: number, status: "sesuai" | "tidak_sesuai") {
    setDrafts((prev) => ({ ...prev, [orderId]: { ...prev[orderId], status } }));
  }

  function setCatatan(orderId: number, catatan: string) {
    setDrafts((prev) => ({ ...prev, [orderId]: { ...prev[orderId], catatan } }));
  }

  function setQtyItem(orderId: number, orderItemId: number, qty: number) {
    setDrafts((prev) => ({
      ...prev,
      [orderId]: {
        ...prev[orderId],
        qtyItems: { ...prev[orderId].qtyItems, [orderItemId]: qty },
      },
    }));
  }

  function konfirmasi() {
    setMsg(null);
    const fd = new FormData();
    fd.append("tandaTerimaId", String(tt.id));
    fd.append(
      "items",
      JSON.stringify(
        Object.values(drafts).map((d) => ({
          orderId: d.orderId,
          status: d.status,
          catatan: d.catatan,
          qtyItems:
            d.status === "tidak_sesuai"
              ? Object.entries(d.qtyItems).map(([id, qty]) => ({
                  orderItemId: Number(id),
                  qtyAktual: qty,
                }))
              : undefined,
        })),
      ),
    );
    const file = fileRef.current?.files?.[0];
    if (file) fd.append("bukti", file);

    start(async () => {
      const res = await konfirmasiTandaTerima(fd);
      if (res.ok) {
        setMsg({ ok: true, text: "Penerimaan tersimpan. Nota yang sesuai pindah ke antrian pengiriman." });
        setTimeout(() => router.refresh(), 1200);
      } else {
        setMsg({ ok: false, text: (res as { ok: false; error: string }).error });
      }
    });
  }

  const tidakSesuaiCount = Object.values(drafts).filter((d) => d.status === "tidak_sesuai").length;

  return (
    <div className="rounded-lg border bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="tabular text-sm font-bold">
            TT-{String(tt.id).padStart(5, "0")}
          </span>
          <span className="text-xs text-muted-foreground">{tglPendek(tt.tanggal)}</span>
          <span className="text-xs text-muted-foreground">dari {tt.adminNama}</span>
          <span className="text-xs text-muted-foreground">{tt.items.length} faktur</span>
        </div>
        {open ? <ChevronUp className="size-4 shrink-0" /> : <ChevronDown className="size-4 shrink-0" />}
      </button>

      {open && (
        <div className="border-t px-4 pb-4 pt-3 space-y-3">
          {tt.items.map((it) => {
            const d = drafts[it.orderId];
            return (
              <div key={it.orderId} className="rounded-md border p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">
                    <span className="tabular font-bold">Faktur #{it.orderId}</span>
                    <span className="text-muted-foreground"> · {it.tokoNama}</span>
                  </span>
                  <div className="flex gap-2">
                    <a
                      href={`/pdf/picklist/${it.orderId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold hover:bg-muted"
                    >
                      <ClipboardList className="size-3.5" /> Pick List
                    </a>
                    <button
                      onClick={() => setStatus(it.orderId, "sesuai")}
                      className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                        d?.status === "sesuai"
                          ? "border-ok bg-ok/15 text-ok"
                          : "hover:bg-muted"
                      }`}
                    >
                      <CheckCircle className="size-3.5" /> Sesuai
                    </button>
                    <button
                      onClick={() => setStatus(it.orderId, "tidak_sesuai")}
                      className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                        d?.status === "tidak_sesuai"
                          ? "border-critical bg-critical/15 text-critical"
                          : "hover:bg-muted"
                      }`}
                    >
                      <XCircle className="size-3.5" /> Tidak Sesuai
                    </button>
                  </div>
                </div>

                {d?.status === "tidak_sesuai" && (
                  <div className="space-y-2 rounded-md bg-critical/5 p-3">
                    <p className="text-xs font-semibold text-critical">
                      Isi qty fisik yang ada di gudang untuk setiap item:
                    </p>
                    {it.orderItems.map((oi) => (
                      <div key={oi.orderItemId} className="flex items-center gap-3">
                        <span className="flex-1 text-sm">{oi.nama}</span>
                        <span className="text-xs text-muted-foreground">
                          Dipesan: {oi.qty} {oi.satuan}
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={oi.qty}
                          className="w-20 rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                          value={d.qtyItems[oi.orderItemId] ?? oi.qty}
                          onChange={(e) =>
                            setQtyItem(it.orderId, oi.orderItemId, Number(e.target.value))
                          }
                        />
                        <span className="w-8 text-xs text-muted-foreground">{oi.satuan}</span>
                      </div>
                    ))}
                    <textarea
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      rows={2}
                      placeholder="Catatan kendala (opsional)…"
                      value={d.catatan}
                      onChange={(e) => setCatatan(it.orderId, e.target.value)}
                    />
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex items-center gap-3">
            <label className={`${btn.outline} cursor-pointer`}>
              <Paperclip className="size-4" />
              {fileName ?? "Upload Bukti (opsional)"}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            {tidakSesuaiCount > 0 && (
              <span className="rounded-md bg-critical/10 px-2 py-1 text-xs font-semibold text-critical">
                {tidakSesuaiCount} faktur tidak sesuai
              </span>
            )}
            <button onClick={konfirmasi} disabled={pending} className={btn.primary}>
              {pending ? "Menyimpan…" : "Konfirmasi Penerimaan"}
            </button>
            {msg && (
              <p className={`text-sm font-semibold ${msg.ok ? "text-ok" : "text-critical"}`}>
                {msg.text}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function TandaTerimaGudangPanel({ pendingTTs }: { pendingTTs: PendingTT[] }) {
  if (pendingTTs.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
        Tidak ada tanda terima yang perlu dikonfirmasi. ✔
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {pendingTTs.map((tt) => (
        <TandaTerimaCard key={tt.id} tt={tt} />
      ))}
    </div>
  );
}
