"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, XCircle, ChevronDown, ChevronUp, Paperclip } from "lucide-react";
import { tglPendek } from "@/lib/format";
import { btn } from "@/lib/ui";
import { konfirmasiTandaTerima } from "@/server/tanda-terima-actions";

type TTItem = {
  id: number;
  orderId: number;
  status: string;
  catatan: string | null;
  tokoNama: string;
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
};

function TandaTerimaCard({ tt }: { tt: PendingTT }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(true);
  const [drafts, setDrafts] = useState<Record<number, ItemDraft>>(
    Object.fromEntries(
      tt.items.map((it) => [
        it.orderId,
        { orderId: it.orderId, status: "sesuai" as const, catatan: "" },
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

  function konfirmasi() {
    setMsg(null);
    const fd = new FormData();
    fd.append("tandaTerimaId", String(tt.id));
    fd.append("items", JSON.stringify(Object.values(drafts)));
    const file = fileRef.current?.files?.[0];
    if (file) fd.append("bukti", file);

    start(async () => {
      const res = await konfirmasiTandaTerima(fd);
      if (res.ok) {
        router.refresh();
      } else {
        setMsg({ ok: false, text: (res as { ok: false; error: string }).error });
      }
    });
  }

  const tidakSesuaiCount = Object.values(drafts).filter((d) => d.status === "tidak_sesuai").length;

  return (
    <div className="rounded-lg border bg-card">
      {/* Header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="tabular text-sm font-bold">
            TT-{String(tt.id).padStart(5, "0")}
          </span>
          <span className="text-xs text-muted-foreground">{tglPendek(tt.tanggal)}</span>
          <span className="text-xs text-muted-foreground">oleh {tt.adminNama}</span>
          <span className="text-xs text-muted-foreground">{tt.items.length} nota</span>
        </div>
        {open ? <ChevronUp className="size-4 shrink-0" /> : <ChevronDown className="size-4 shrink-0" />}
      </button>

      {open && (
        <div className="border-t px-4 pb-4 pt-3 space-y-3">
          {/* Per-order rows */}
          {tt.items.map((it) => {
            const d = drafts[it.orderId];
            return (
              <div key={it.orderId} className="rounded-md border p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">
                    <span className="tabular font-bold">INV-{it.orderId}</span>
                    <span className="text-muted-foreground"> · {it.tokoNama}</span>
                  </span>
                  <div className="flex gap-2">
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
                  <textarea
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    rows={2}
                    placeholder="Catatan kendala (opsional)…"
                    value={d.catatan}
                    onChange={(e) => setCatatan(it.orderId, e.target.value)}
                  />
                )}
              </div>
            );
          })}

          {/* Bukti upload */}
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

          {/* Summary + confirm */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {tidakSesuaiCount > 0 && (
              <span className="rounded-md bg-critical/10 px-2 py-1 text-xs font-semibold text-critical">
                {tidakSesuaiCount} nota tidak sesuai
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
        Tidak ada tanda terima yang perlu dikonfirmasi.
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
