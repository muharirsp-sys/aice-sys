"use client";

import { useState } from "react";
import {
  Camera,
  MapPin,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  ImageOff,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { btn } from "@/lib/ui";

export type EvidenceField = {
  label: string;
  value: string;
  // Sorot baris (mis. nominal yang sedang dicocokkan / selisih).
  highlight?: "ok" | "warning" | "critical";
  mono?: boolean;
};

// Pemeriksaan bukti silang (side-by-side): foto fisik (nota/struk) di kiri,
// angka sistem di kanan, dalam satu layar tanpa pindah halaman. Auditor bisa
// zoom foto dan langsung mencocokkan dengan nilai tercatat.
export function EvidenceViewer({
  title,
  imageUrl,
  imageAlt = "Bukti",
  gps,
  mapsHref,
  fields,
  // Teks tombol pemicu; jika triggerless dipakai sebagai kartu inline.
  triggerLabel = "Periksa Bukti",
}: {
  title: string;
  imageUrl: string | null;
  imageAlt?: string;
  gps?: string | null;
  mapsHref?: string | null;
  fields: EvidenceField[];
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(false);

  const HL: Record<string, string> = {
    ok: "text-ok",
    warning: "text-warning-foreground",
    critical: "text-critical",
  };

  return (
    <>
      <div className="flex items-start gap-4">
        {/* Thumbnail pemicu */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group relative block size-28 shrink-0 overflow-hidden rounded-md border bg-muted"
          aria-label={`${title} — buka pemeriksaan bukti`}
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={imageAlt}
              loading="lazy"
              decoding="async"
              className="size-full object-cover transition-transform group-hover:scale-105"
            />
          ) : (
            <span className="grid size-full place-items-center">
              <Camera className="size-6 text-muted-foreground" />
            </span>
          )}
          <span className="absolute inset-x-0 bottom-0 bg-foreground/55 py-0.5 text-center text-[10px] font-semibold text-background">
            <ZoomIn className="mr-1 inline size-3" />
            Periksa
          </span>
        </button>

        {/* Ringkasan angka (inline) */}
        <dl className="min-w-0 flex-1 space-y-1 text-sm">
          {fields.slice(0, 3).map((f) => (
            <div key={f.label} className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{f.label}</dt>
              <dd
                className={`text-right ${f.mono ? "tabular" : ""} font-semibold ${
                  f.highlight ? HL[f.highlight] : ""
                }`}
              >
                {f.value}
              </dd>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="pt-1 text-xs font-semibold text-primary hover:underline"
          >
            {triggerLabel} →
          </button>
        </dl>
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title={title} size="xl">
        <div className="grid gap-5 md:grid-cols-2">
          {/* Kiri: bukti fisik */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Bukti Fisik
              </h3>
              {imageUrl && (
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setZoom((z) => !z)}
                    className={btn.ghost}
                    aria-label={zoom ? "Perkecil" : "Perbesar"}
                  >
                    {zoom ? <ZoomOut className="size-4" /> : <ZoomIn className="size-4" />}
                    {zoom ? "Perkecil" : "Perbesar"}
                  </button>
                  <a
                    href={imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={btn.outline}
                  >
                    <ExternalLink className="size-4" /> Tab baru
                  </a>
                </div>
              )}
            </div>

            <div className="overflow-auto rounded-md border bg-muted" style={{ maxHeight: "60vh" }}>
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt={imageAlt}
                  className={`mx-auto block ${zoom ? "max-w-none cursor-zoom-out" : "w-full cursor-zoom-in"} object-contain`}
                  onClick={() => setZoom((z) => !z)}
                  style={zoom ? { width: "180%" } : undefined}
                />
              ) : (
                <div className="grid h-48 place-items-center text-muted-foreground">
                  <span className="flex flex-col items-center gap-2 text-sm">
                    <ImageOff className="size-7" />
                    Tidak ada bukti terunggah
                  </span>
                </div>
              )}
            </div>

            {gps && mapsHref && (
              <a
                href={mapsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <MapPin className="size-3.5" /> <span className="tabular">{gps}</span>{" "}
                <ExternalLink className="size-3" />
              </a>
            )}
          </div>

          {/* Kanan: angka sistem */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Angka Sistem
            </h3>
            <dl className="divide-y rounded-md border">
              {fields.map((f) => (
                <div key={f.label} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <dt className="text-sm text-muted-foreground">{f.label}</dt>
                  <dd
                    className={`text-right text-sm ${f.mono ? "tabular" : ""} font-semibold ${
                      f.highlight ? HL[f.highlight] : ""
                    }`}
                  >
                    {f.value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-muted-foreground">
              Cocokkan nominal & tanggal pada bukti fisik dengan angka sistem di atas. Selisih
              ditandai warna.
            </p>
          </div>
        </div>
      </Dialog>
    </>
  );
}
