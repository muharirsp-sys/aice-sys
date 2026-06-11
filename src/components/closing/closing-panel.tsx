"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Lock, TriangleAlert, BellRing, Download } from "lucide-react";
import { btn } from "@/lib/ui";
import { markClosing, lockDate, sendTeguran } from "@/server/actions";

type DivisiState = {
  role: string;
  label: string;
  done: boolean;
  oleh?: string;
  waktu?: string;
  ditegur?: string;
};

export function ClosingPanel({
  tanggalLabel,
  tanggal,
  cabangNama,
  divisi,
  isLocked,
  actorRole,
  isOwner,
  blockers,
  h1Locked,
}: {
  tanggalLabel: string;
  tanggal: string;
  cabangNama: string;
  divisi: DivisiState[];
  isLocked: boolean;
  actorRole: string | null;
  isOwner: boolean;
  blockers: Record<string, number>;
  h1Locked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const giliranIdx = divisi.findIndex((d) => !d.done);
  const actorIdx = divisi.findIndex((d) => d.role === actorRole);
  const semuaSelesai = giliranIdx === -1;
  const belum = divisi.filter((d) => !d.done);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErr(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setErr(r.error ?? "Gagal.");
      else router.refresh();
    });
  }

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {cabangNama} · <span className="tabular">{tanggalLabel}</span>
        </p>
        {isLocked ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-foreground/10 px-2.5 py-1 text-xs font-semibold">
            <Lock className="size-3.5" /> Terkunci (immutable)
          </span>
        ) : (
          <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
            {divisi.filter((d) => d.done).length}/{divisi.length} divisi closing
          </span>
        )}
      </div>

      {err && (
        <p className="mb-4 rounded-md border border-l-4 border-l-critical bg-critical/10 p-3 text-sm font-semibold text-critical">{err}</p>
      )}

      {!h1Locked && !isLocked && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-l-4 border-l-critical bg-critical/10 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-critical" />
          <span>
            <strong>Perhatian:</strong> Tanggal kemarin belum dikunci — operasi hari ini diblokir sampai Owner kunci H-1.
          </span>
        </div>
      )}

      {!isLocked && belum.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-l-4 border-l-warning bg-warning/15 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
          <span>
            Belum closing: <strong>{belum.map((d) => d.label).join(", ")}</strong>. Closing berurutan
            (Sales → Admin → Gudang → Delivery → Incaso).
          </span>
        </div>
      )}

      <ol className="space-y-2">
        {divisi.map((d, i) => {
          const isGiliran = !isLocked && i === giliranIdx;
          const bisaTutupSendiri = isGiliran && i === actorIdx;
          return (
            <li
              key={d.role}
              className={`flex flex-wrap items-center gap-3 rounded-md border p-3 ${isGiliran ? "border-primary bg-primary/5" : ""}`}
            >
              {d.done ? (
                <CheckCircle2 className="size-5 shrink-0 text-ok" />
              ) : (
                <Clock className="size-5 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{d.label}</p>
                <p className="text-xs text-muted-foreground">
                  {d.done
                    ? `Ditutup ${d.oleh ?? "-"} · ${d.waktu ?? ""}`
                    : isGiliran
                      ? "Giliran sekarang"
                      : "Menunggu giliran"}
                </p>
              </div>

              {!d.done && (blockers[d.role] ?? 0) > 0 && (
                <span className="inline-flex items-center rounded-md bg-critical/15 px-2 py-0.5 text-xs font-semibold text-critical">
                  {blockers[d.role]} order tertunda
                </span>
              )}

              {!d.done && d.ditegur && (
                <span className="inline-flex items-center gap-1 rounded-md bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                  <BellRing className="size-3.5" /> Ditegur {d.ditegur}
                </span>
              )}

              {d.done ? (
                <span className="inline-flex items-center rounded-md bg-ok/15 px-2 py-0.5 text-xs font-semibold text-ok">Selesai</span>
              ) : bisaTutupSendiri ? (
                <button className={btn.primary} disabled={pending} onClick={() => run(() => markClosing())}>
                  Closing Divisi Saya
                </button>
              ) : isOwner ? (
                <button className={btn.accent} disabled={pending} onClick={() => run(() => sendTeguran(d.role))}>
                  <BellRing className="size-4" /> Tegur
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="mt-5 border-t pt-4">
        {isLocked ? (
          <p className="rounded-md border border-l-4 border-l-foreground/40 bg-muted p-3 text-sm font-semibold">
            Data tanggal ini terkunci. Tidak dapat diubah oleh siapa pun (termasuk admin).
          </p>
        ) : isOwner ? (
          <>
            <button className={btn.danger} disabled={!semuaSelesai || pending} onClick={() => run(() => lockDate())}>
              <Lock className="size-4" /> Kunci Tanggal (Immutable)
            </button>
            {!semuaSelesai && (
              <p className="mt-2 text-xs text-muted-foreground">Kunci aktif setelah semua divisi closing.</p>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Penguncian tanggal dilakukan oleh Owner.</p>
        )}
        <div className="mt-3">
          <a
            href={`/export/rekap_harian?from=${tanggal}&to=${tanggal}`}
            target="_blank"
            rel="noopener noreferrer"
            className={btn.outline}
          >
            <Download className="size-4" /> Unduh Rekap Harian
          </a>
        </div>
      </div>
    </div>
  );
}
