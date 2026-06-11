"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Check } from "lucide-react";
import { rupiah } from "@/lib/format";
import { subtotalItem } from "@/lib/pricing-calc";
import { btn, input, label } from "@/lib/ui";
import { createKanvasOrder } from "@/server/kanvas-actions";
import { Combobox, type ComboOption } from "@/components/ui/combobox";
import { KirimWaButton } from "./kirim-wa-button";

type Toko = { id: number; nama: string; noTelp: string | null };
// Produk dibatasi muatan trip: harga cabang + sisa stok van.
type ProdukMuatan = { produkId: number; nama: string; satuan: string; harga: number; sisa: number };
type Diskon = { tokoId: number; produkId: number; batasPersen: number; batasRupiah: number };

// qty: "" = belum diisi (memaksa sales mengetik), bukan default 1.
type Line = { key: number; produkId: number; qty: number | ""; diskonPersen: number; diskonRupiah: number };

let seq = 1;
const newLine = (): Line => ({ key: seq++, produkId: 0, qty: "", diskonPersen: 0, diskonRupiah: 0 });

// Form faktur kanvas — dibuat langsung di toko, terbit tanpa approval admin.
export function KanvasOrderForm({
  tripId,
  tokos,
  produks,
  diskon,
}: {
  tripId: number;
  tokos: Toko[];
  produks: ProdukMuatan[];
  diskon: Diskon[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Tanpa default toko: sales wajib memilih toko secara sadar (anti blind-submit).
  const [tokoId, setTokoId] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [terbit, setTerbit] = useState<{ orderId: number; shareToken: string; tokoNama: string; noTelp: string | null; total: number } | null>(null);

  const tersedia = produks.filter((p) => p.sisa > 0);
  const prod = (id: number) => produks.find((p) => p.produkId === id);
  const tokoOpts: ComboOption[] = tokos.map((t) => ({
    value: t.id,
    label: t.nama,
    hint: t.noTelp ? undefined : "(tanpa no. telp)",
  }));
  const produkOpts: ComboOption[] = tersedia.map((p) => ({
    value: p.produkId,
    label: p.nama,
    hint: `(${p.satuan}) — sisa ${p.sisa}`,
  }));
  const qtyNum = (q: number | "") => (typeof q === "number" ? q : 0);
  const caps = (pid: number) =>
    diskon.find((d) => d.tokoId === tokoId && d.produkId === pid) ?? { batasPersen: 0, batasRupiah: 0 };

  function update(key: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setMsg(null);
  }
  function sub(l: Line) {
    return subtotalItem({ qty: qtyNum(l.qty), hargaSatuan: prod(l.produkId)?.harga ?? 0, diskonPersen: l.diskonPersen, diskonRupiah: l.diskonRupiah });
  }
  // Sisa per produk dikurangi qty baris lain dengan produk sama (cegah dobel input).
  function maxQty(l: Line) {
    const total = prod(l.produkId)?.sisa ?? 0;
    const lain = lines.filter((x) => x.key !== l.key && x.produkId === l.produkId).reduce((s, x) => s + qtyNum(x.qty), 0);
    return total - lain;
  }
  // Baris belum lengkap: produk belum dipilih atau qty belum diisi (≥1).
  function lineIncomplete(l: Line) {
    return l.produkId === 0 || l.qty === "" || qtyNum(l.qty) < 1;
  }
  function lineInvalid(l: Line) {
    const c = caps(l.produkId);
    return l.diskonPersen > c.batasPersen || l.diskonRupiah > c.batasRupiah || qtyNum(l.qty) > maxQty(l);
  }

  const total = lines.reduce((s, l) => s + sub(l), 0);
  const bisaSimpan =
    tokoId > 0 &&
    lines.length > 0 &&
    !lines.some(lineIncomplete) &&
    !lines.some(lineInvalid) &&
    !pending;

  function simpan() {
    setMsg(null);
    startTransition(async () => {
      const res = await createKanvasOrder({
        tripId,
        tokoId,
        items: lines.map((l) => ({ produkId: l.produkId, qty: qtyNum(l.qty), diskonPersen: l.diskonPersen, diskonRupiah: l.diskonRupiah })),
      });
      if (res.ok && res.orderId && res.shareToken) {
        const t = tokos.find((x) => x.id === tokoId);
        setTerbit({ orderId: res.orderId, shareToken: res.shareToken, tokoNama: t?.nama ?? "", noTelp: t?.noTelp ?? null, total });
        setMsg({ ok: true, text: `Faktur INV-${res.orderId} terbit — siap dikirim ke WA toko.` });
        // Reset penuh: toko & item kosong lagi agar faktur berikutnya dipilih ulang.
        setTokoId(0);
        setLines([]);
        router.refresh();
      } else if (!res.ok) {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  if (tersedia.length === 0) {
    return <p className="rounded-md border border-dashed p-6 text-center text-muted-foreground">Muatan habis — tidak ada produk tersisa untuk difakturkan.</p>;
  }

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-5 max-w-sm">
        <label className={label}>Toko</label>
        <Combobox
          options={tokoOpts}
          value={tokoId}
          onChange={(v) => { setTokoId(v); setMsg(null); }}
          placeholder="— Pilih Toko —"
          searchPlaceholder="Cari nama toko..."
          invalid={tokoId === 0}
        />
      </div>

      <div className="space-y-3">
        {lines.length === 0 && (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Belum ada item. Tekan “Tambah Item” lalu pilih produk & isi qty.
          </p>
        )}
        {lines.map((l) => {
          const c = caps(l.produkId);
          const overP = l.diskonPersen > c.batasPersen;
          const overR = l.diskonRupiah > c.batasRupiah;
          const mq = maxQty(l);
          const noProduk = l.produkId === 0;
          const noQty = l.qty === "" || qtyNum(l.qty) < 1;
          const overQ = qtyNum(l.qty) > mq;
          return (
            <div key={l.key} className="grid grid-cols-2 gap-3 rounded-md border p-3 sm:grid-cols-[1fr_auto_auto_auto_auto_auto] sm:items-end">
              <div className="col-span-2 sm:col-span-1">
                <label className={label}>Produk (sisa muatan)</label>
                <Combobox
                  options={produkOpts}
                  value={l.produkId}
                  onChange={(v) => update(l.key, { produkId: v })}
                  placeholder="— Pilih Produk —"
                  searchPlaceholder="Cari nama produk..."
                  invalid={noProduk}
                  emptyText="Muatan habis."
                />
              </div>
              <div>
                <label className={label}>Qty</label>
                <input
                  type="number"
                  min={1}
                  placeholder="0"
                  className={`${input} w-20 tabular ${overQ || noQty ? "border-critical text-critical" : ""}`}
                  value={l.qty}
                  onChange={(e) => {
                    const v = e.target.value;
                    update(l.key, { qty: v === "" ? "" : Math.max(1, Number(v)) });
                  }}
                />
              </div>
              <div>
                <label className={label}>Disk %</label>
                <input type="number" min={0} className={`${input} w-20 tabular ${overP ? "border-critical text-critical" : ""}`} value={l.diskonPersen} onChange={(e) => update(l.key, { diskonPersen: Math.max(0, Number(e.target.value)) })} />
              </div>
              <div>
                <label className={label}>Disk Rp</label>
                <input type="number" min={0} className={`${input} w-24 tabular ${overR ? "border-critical text-critical" : ""}`} value={l.diskonRupiah} onChange={(e) => update(l.key, { diskonRupiah: Math.max(0, Number(e.target.value)) })} />
              </div>
              <div className="text-right">
                <label className={label}>Subtotal</label>
                <p className="tabular py-2 font-bold">{rupiah(sub(l))}</p>
              </div>
              <button onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Hapus item" className="grid size-10 place-items-center self-end rounded-md text-muted-foreground hover:bg-muted">
                <Trash2 className="size-4" />
              </button>
              {overQ && (
                <p className="col-span-full text-xs font-semibold text-critical">Qty melebihi sisa muatan ({mq}).</p>
              )}
              {(overP || overR) && (
                <p className="col-span-full text-xs font-semibold text-critical">
                  Diskon melebihi batas toko (maks {c.batasPersen}% / {rupiah(c.batasRupiah)}/unit).
                </p>
              )}
            </div>
          );
        })}
      </div>

      <button onClick={() => setLines((ls) => [...ls, newLine()])} className={`${btn.outline} mt-3`}>
        <Plus className="size-4" /> Tambah Item
      </button>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div>
          <p className="text-sm text-muted-foreground">Total Faktur</p>
          <p className="tabular text-3xl font-extrabold tracking-tight">{rupiah(total)}</p>
        </div>
        <button disabled={!bisaSimpan} onClick={simpan} className={btn.primary}>
          <Check className="size-4" /> {pending ? "Menerbitkan…" : "Terbitkan Faktur"}
        </button>
      </div>

      {!bisaSimpan && !pending && (tokoId === 0 || lines.length === 0 || lines.some(lineIncomplete)) && (
        <p className="mt-3 text-xs text-muted-foreground">
          Lengkapi toko, produk, dan qty setiap item sebelum menerbitkan faktur.
        </p>
      )}

      {msg && (
        <p className={`mt-3 rounded-md border border-l-4 p-3 text-sm font-semibold ${msg.ok ? "border-l-ok bg-ok/10 text-ok" : "border-l-critical bg-critical/10 text-critical"}`}>
          {msg.text}
        </p>
      )}
      {terbit && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-l-4 border-l-primary bg-primary/5 p-3">
          <span className="text-sm font-semibold">INV-{terbit.orderId} · {terbit.tokoNama} · {rupiah(terbit.total)}</span>
          <KirimWaButton orderId={terbit.orderId} shareToken={terbit.shareToken} noTelp={terbit.noTelp} tokoNama={terbit.tokoNama} total={terbit.total} />
          <a href={`/pdf/faktur/${terbit.orderId}`} target="_blank" rel="noopener noreferrer" className={btn.ghost}>Lihat PDF</a>
        </div>
      )}
    </div>
  );
}
