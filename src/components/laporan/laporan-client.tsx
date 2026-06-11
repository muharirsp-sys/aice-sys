"use client";

import { useState, useMemo } from "react";
import { Download, FileSpreadsheet, RotateCcw } from "lucide-react";
import { btn, input, label } from "@/lib/ui";
import type { ReportMeta } from "@/server/reports";

type Opt = { id: number; nama: string };
type TokoOpt = { id: number; nama: string; cabangId: number };

export function LaporanClient({
  groups,
  cabangs,
  tokos,
  produks,
}: {
  groups: { group: string; reports: ReportMeta[] }[];
  cabangs: Opt[];
  tokos: TokoOpt[];
  produks: Opt[];
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cabang, setCabang] = useState(0);
  const [toko, setToko] = useState(0);
  const [produk, setProduk] = useState(0);

  // Opsi toko disaring sesuai cabang terpilih (lebih relevan untuk user).
  const tokoOpts = useMemo(
    () => (cabang === 0 ? tokos : tokos.filter((t) => t.cabangId === cabang)),
    [tokos, cabang],
  );

  // Saat cabang berubah, reset toko bila tidak lagi termasuk cabang itu.
  function handleCabang(v: number) {
    setCabang(v);
    if (v !== 0 && toko !== 0) {
      const stillValid = tokos.some((t) => t.id === toko && t.cabangId === v);
      if (!stillValid) setToko(0);
    }
  }

  function reset() {
    setFrom("");
    setTo("");
    setCabang(0);
    setToko(0);
    setProduk(0);
  }

  const rangeInvalid = from !== "" && to !== "" && from > to;

  // Bangun URL unduhan per laporan berdasarkan filter yang berlaku untuknya.
  function buildHref(r: ReportMeta): string {
    const p = new URLSearchParams();
    if (cabang > 0) p.set("cabang", String(cabang));
    if (r.supportsFilter && !rangeInvalid) {
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      if (r.filterToko && toko > 0) p.set("toko", String(toko));
      if (r.filterProduk && produk > 0) p.set("produk", String(produk));
    }
    const qs = p.toString();
    return `/export/${r.entity}${qs ? `?${qs}` : ""}`;
  }

  // Ringkasan filter yang aktif untuk sebuah laporan (ditampilkan di kartu).
  function activeBadges(r: ReportMeta): string[] {
    const out: string[] = [];
    if (cabang > 0) {
      const c = cabangs.find((x) => x.id === cabang);
      if (c) out.push(c.nama);
    }
    if (r.supportsFilter && !rangeInvalid) {
      if (from || to) out.push(`${from || "…"} s/d ${to || "…"}`);
      if (r.filterToko && toko > 0) {
        const t = tokos.find((x) => x.id === toko);
        if (t) out.push(t.nama);
      }
      if (r.filterProduk && produk > 0) {
        const pr = produks.find((x) => x.id === produk);
        if (pr) out.push(pr.nama);
      }
    }
    return out;
  }

  const hasFilter = from || to || cabang || toko || produk;

  return (
    <>
      {/* Panel filter */}
      <div className="mb-6 rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Filter
          </h2>
          {hasFilter ? (
            <button className={btn.ghost} onClick={reset}>
              <RotateCcw className="size-4" /> Reset
            </button>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={label}>Dari Tanggal</label>
            <input
              type="date"
              className={`${input} tabular`}
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label className={label}>Sampai Tanggal</label>
            <input
              type="date"
              className={`${input} tabular ${rangeInvalid ? "border-critical" : ""}`}
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div>
            <label className={label}>Cabang</label>
            <select
              className={input}
              value={cabang}
              onChange={(e) => handleCabang(Number(e.target.value))}
            >
              <option value={0}>Semua Cabang</option>
              {cabangs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nama}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Customer / Toko</label>
            <select
              className={input}
              value={toko}
              onChange={(e) => setToko(Number(e.target.value))}
            >
              <option value={0}>Semua Toko</option>
              {tokoOpts.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nama}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Item / Produk</label>
            <select
              className={input}
              value={produk}
              onChange={(e) => setProduk(Number(e.target.value))}
            >
              <option value={0}>Semua Produk</option>
              {produks.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nama}
                </option>
              ))}
            </select>
          </div>
        </div>

        {rangeInvalid ? (
          <p className="mt-3 text-sm font-semibold text-critical">
            Rentang tanggal tidak valid: tanggal akhir lebih awal dari tanggal mulai.
          </p>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            Filter tanggal, customer, dan item hanya berlaku untuk laporan transaksi.
            Filter cabang juga membatasi master toko, harga, dan pengguna.
          </p>
        )}
      </div>

      {/* Daftar laporan */}
      <div className="space-y-8">
        {groups.map(({ group, reports }) => (
          <section key={group}>
            <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {group}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {reports.map((r) => {
                const badges = activeBadges(r);
                return (
                  <div
                    key={r.entity}
                    className="flex flex-col gap-3 rounded-lg border bg-card p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/12 text-primary">
                          <FileSpreadsheet className="size-5" />
                        </span>
                        <p className="truncate text-sm font-semibold">{r.label}</p>
                      </div>
                      <a
                        href={buildHref(r)}
                        className={`${btn.outline} shrink-0`}
                        aria-label={`Unduh ${r.label}`}
                      >
                        <Download className="size-4" /> Excel
                      </a>
                    </div>
                    {badges.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {badges.map((b, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                          >
                            {b}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
