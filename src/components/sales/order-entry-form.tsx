"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Check, History, Star, RotateCcw } from "lucide-react";
import { rupiah, tglPendek } from "@/lib/format";
import { subtotalItem } from "@/lib/pricing-calc";
import { btn, input, label } from "@/lib/ui";
import { createOrder } from "@/server/actions";
import { getTokoContext, type TokoContext } from "@/server/sales-context";
import { Combobox, type ComboOption } from "@/components/ui/combobox";
import { Dialog } from "@/components/ui/dialog";

type Toko = { id: number; nama: string };
type ProdukSatuanOption = { id: number; satuan: string; isDefault: boolean };
type Produk = { id: number; nama: string; satuan: string; harga: number; satuans: ProdukSatuanOption[] };
type Diskon = {
  tokoId: number;
  produkId: number;
  batasPersen: number;
  batasRupiah: number;
};

// qty: "" = belum diisi (memaksa sales mengetik), bukan default 1.
type Line = { key: number; produkId: number; satuanId: number; qty: number | ""; diskonPersen: number; diskonRupiah: number };

let seq = 1;
const newLine = (): Line => ({ key: seq++, produkId: 0, satuanId: 0, qty: "", diskonPersen: 0, diskonRupiah: 0 });

export function OrderEntryForm({
  tokos,
  produks,
  diskon,
}: {
  tokos: Toko[];
  produks: Produk[];
  diskon: Diskon[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Tidak ada default: sales wajib memilih toko & produk secara sadar (anti blind-submit).
  const [tokoId, setTokoId] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Konteks toko (histori pembelian, produk favorit) untuk cross/up-sell.
  const [ctx, setCtx] = useState<TokoContext | null>(null);
  const [ctxLoading, startCtx] = useTransition();
  // Penanda request terbaru: cegah respons basi menimpa konteks toko yang salah.
  const ctxReq = useRef(0);

  const tokoOpts: ComboOption[] = tokos.map((t) => ({ value: t.id, label: t.nama }));
  const produkOpts: ComboOption[] = produks.map((p) => ({
    value: p.id,
    label: p.nama,
    hint: `(${p.satuan})`,
  }));

  const hargaOf = (id: number) => produks.find((p) => p.id === id)?.harga ?? 0;
  const namaOf = (id: number) => produks.find((p) => p.id === id)?.nama ?? "";
  const satuansOf = (id: number) => produks.find((p) => p.id === id)?.satuans ?? [];
  const defaultSatuanId = (id: number) => satuansOf(id).find((s) => s.isDefault)?.id ?? satuansOf(id)[0]?.id ?? 0;
  const satuanLabelOf = (produkId: number, satuanId: number) =>
    satuansOf(produkId).find((s) => s.id === satuanId)?.satuan ??
    produks.find((p) => p.id === produkId)?.satuan ?? "—";
  const namaTokoOf = () => tokos.find((t) => t.id === tokoId)?.nama ?? "";
  const qtyNum = (q: number | "") => (typeof q === "number" ? q : 0);
  const caps = (pid: number) =>
    diskon.find((d) => d.tokoId === tokoId && d.produkId === pid) ?? {
      batasPersen: 0,
      batasRupiah: 0,
    };

  function selectToko(id: number) {
    const myReq = ++ctxReq.current;
    setTokoId(id);
    setMsg(null);
    setCtx(null);
    if (id > 0) {
      startCtx(async () => {
        const r = await getTokoContext(id);
        // Abaikan respons basi (toko sudah diganti sebelum query ini selesai).
        if (r.ok && ctxReq.current === myReq) setCtx(r.ctx);
      });
    }
  }

  function update(key: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setMsg(null);
  }
  // Baris belum lengkap: produk belum dipilih, satuan belum dipilih, atau qty belum diisi (≥1).
  function lineIncomplete(l: Line) {
    return l.produkId === 0 || l.satuanId === 0 || l.qty === "" || qtyNum(l.qty) < 1;
  }
  function lineInvalid(l: Line) {
    const c = caps(l.produkId);
    return l.diskonPersen > c.batasPersen || l.diskonRupiah > c.batasRupiah;
  }
  function sub(l: Line) {
    return subtotalItem({ qty: qtyNum(l.qty), hargaSatuan: hargaOf(l.produkId), diskonPersen: l.diskonPersen, diskonRupiah: l.diskonRupiah });
  }

  // Cross/up-sell: tambahkan 1 baris produk favorit (jika belum ada).
  function addProduk(produkId: number) {
    setMsg(null);
    setLines((ls) => {
      if (ls.some((l) => l.produkId === produkId)) return ls;
      return [...ls, { key: seq++, produkId, satuanId: defaultSatuanId(produkId), qty: 1, diskonPersen: 0, diskonRupiah: 0 }];
    });
  }

  // Quick reorder: tambahkan item order terakhir toko ini (merge, jangan timpa baris
  // yang sudah diketik; hanya produk yang masih ada harganya di cabang).
  function reorderLast() {
    if (!ctx?.lastOrder) return;
    const valid = ctx.lastOrder.items.filter((it) => produks.some((p) => p.id === it.produkId));
    if (valid.length === 0) return;
    setMsg(null);
    setLines((ls) => {
      const have = new Set(ls.map((l) => l.produkId));
      const add = valid
        .filter((it) => !have.has(it.produkId))
        .map((it) => ({ key: seq++, produkId: it.produkId, satuanId: defaultSatuanId(it.produkId), qty: it.qty, diskonPersen: 0, diskonRupiah: 0 }));
      return [...ls, ...add];
    });
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
      const res = await createOrder({
        tokoId,
        items: lines.map((l) => ({
          produkId: l.produkId,
          satuanId: l.satuanId,
          qty: qtyNum(l.qty),
          diskonPersen: l.diskonPersen,
          diskonRupiah: l.diskonRupiah,
        })),
      });
      if (res.ok) {
        setMsg({ ok: true, text: `Pesanan #${res.orderId} disimpan — status Pending. Menunggu persetujuan Admin.` });
        // Reset penuh: toko & item kosong lagi agar order berikutnya dipilih ulang.
        setTokoId(0);
        setLines([]);
        setCtx(null);
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-5 max-w-sm">
        <label className={label}>Toko</label>
        <Combobox
          options={tokoOpts}
          value={tokoId}
          onChange={selectToko}
          placeholder="— Pilih Toko —"
          searchPlaceholder="Cari nama toko..."
          invalid={tokoId === 0}
        />
      </div>

      {/* Panel konteks toko: histori + produk favorit + reorder (cross/up-sell). */}
      {tokoId > 0 && (
        <div className="mb-5 rounded-md border border-l-4 border-l-primary bg-primary/5 p-4">
          {ctxLoading && !ctx ? (
            <p className="text-sm text-muted-foreground">Memuat riwayat toko…</p>
          ) : ctx ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                {ctx.alamat && <span className="text-muted-foreground">{ctx.alamat}</span>}
                {ctx.noTelp && <span className="tabular text-muted-foreground">· {ctx.noTelp}</span>}
                <span className="inline-flex items-center gap-1 font-semibold">
                  <History className="size-3.5" /> {ctx.totalOrder} order
                </span>
              </div>

              {ctx.lastOrder ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">
                    Order terakhir #{ctx.lastOrder.id} · {tglPendek(ctx.lastOrder.tanggal)} · {ctx.lastOrder.items.length} item
                  </span>
                  <button type="button" className={btn.outline} onClick={reorderLast}>
                    <RotateCcw className="size-4" /> Pesan Lagi
                  </button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Toko baru — belum ada riwayat order.</p>
              )}

              {ctx.topProduk.length > 0 && (
                <div>
                  <p className="mb-1.5 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Star className="size-3.5" /> Sering Dibeli
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ctx.topProduk
                      .filter((tp) => produks.some((p) => p.id === tp.produkId))
                      .map((tp) => {
                        const added = lines.some((l) => l.produkId === tp.produkId);
                        return (
                          <button
                            key={tp.produkId}
                            type="button"
                            disabled={added}
                            onClick={() => addProduk(tp.produkId)}
                            className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-sm transition-colors hover:bg-muted disabled:opacity-50 disabled:pointer-events-none`}
                          >
                            <Plus className="size-3.5" /> {tp.nama}
                            <span className="tabular text-xs text-muted-foreground">{tp.totalQty}{tp.satuan ? ` ${tp.satuan}` : ""}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

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
          const noProduk = l.produkId === 0;
          const noQty = l.qty === "" || qtyNum(l.qty) < 1;
          return (
            <div key={l.key} className="grid grid-cols-2 gap-3 rounded-md border p-3 sm:grid-cols-[1fr_auto_auto_auto_auto_auto_auto] sm:items-end">
              <div className="col-span-2 sm:col-span-1">
                <label className={label}>Produk</label>
                <Combobox
                  options={produkOpts}
                  value={l.produkId}
                  onChange={(v) => update(l.key, { produkId: v, satuanId: defaultSatuanId(v) })}
                  placeholder="— Pilih Produk —"
                  searchPlaceholder="Cari nama produk..."
                  invalid={noProduk}
                />
              </div>
              <div>
                <label className={label}>Satuan</label>
                {l.produkId > 0 ? (
                  <select
                    className={input}
                    value={l.satuanId}
                    onChange={(e) => update(l.key, { satuanId: Number(e.target.value) })}
                  >
                    {satuansOf(l.produkId).map((s) => (
                      <option key={s.id} value={s.id}>{s.satuan}</option>
                    ))}
                  </select>
                ) : (
                  <p className="py-2 text-sm text-muted-foreground">—</p>
                )}
              </div>
              <div>
                <label className={label}>Qty</label>
                <input
                  type="number"
                  min={1}
                  placeholder="0"
                  className={`${input} w-20 tabular ${noQty ? "border-critical" : ""}`}
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
              {(overP || overR) && (
                <p className="col-span-full text-xs font-semibold text-critical">
                  Diskon melebihi batas toko (maks {c.batasPersen}% / {rupiah(c.batasRupiah)}/unit) untuk {namaOf(l.produkId)}.
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
          <p className="text-sm text-muted-foreground">Total Pesanan</p>
          <p className="tabular text-3xl font-extrabold tracking-tight">{rupiah(total)}</p>
        </div>
        <button disabled={!bisaSimpan} onClick={() => setConfirmOpen(true)} className={btn.primary}>
          <Check className="size-4" /> Simpan Pesanan
        </button>
      </div>

      {!bisaSimpan && !pending && (tokoId === 0 || lines.length === 0 || lines.some(lineIncomplete)) && (
        <p className="mt-3 text-xs text-muted-foreground">
          Lengkapi toko, produk, dan qty setiap item sebelum menyimpan.
        </p>
      )}

      {msg && (
        <p className={`mt-3 rounded-md border border-l-4 p-3 text-sm font-semibold ${msg.ok ? "border-l-ok bg-ok/10 text-ok" : "border-l-critical bg-critical/10 text-critical"}`}>
          {msg.text}
        </p>
      )}

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Konfirmasi Simpan"
      >
        <p className="mb-4 rounded-md bg-muted p-3 text-sm leading-relaxed">
          Pastikan order, kuantitas, dan diskon sudah sesuai. Order yang disimpan akan masuk ke antrean validasi.
        </p>
        <div className="mb-4 space-y-1 text-sm">
          <p><span className="text-muted-foreground">Toko:</span> <strong>{namaTokoOf()}</strong></p>
          <p><span className="text-muted-foreground">Jumlah item:</span> <strong>{lines.length}</strong></p>
          {lines.map((l) => (
            <p key={l.key} className="pl-3 text-xs text-muted-foreground">
              · {namaOf(l.produkId)} — {typeof l.qty === "number" ? l.qty : 0} {satuanLabelOf(l.produkId, l.satuanId)}
              {(l.diskonPersen > 0 || l.diskonRupiah > 0) && (
                <span className="ml-1 text-primary">
                  (disk {l.diskonPersen > 0 ? `${l.diskonPersen}%` : ""}{l.diskonPersen > 0 && l.diskonRupiah > 0 ? "+" : ""}{l.diskonRupiah > 0 ? rupiah(l.diskonRupiah) : ""})
                </span>
              )}
            </p>
          ))}
          <p className="pt-1 font-bold">Total: {rupiah(total)}</p>
        </div>
        <div className="flex justify-end gap-2">
          <button className={btn.outline} onClick={() => setConfirmOpen(false)}>Batal</button>
          <button
            className={btn.primary}
            disabled={pending}
            onClick={() => { setConfirmOpen(false); simpan(); }}
          >
            <Check className="size-4" /> {pending ? "Menyimpan…" : "Konfirmasi & Simpan"}
          </button>
        </div>
      </Dialog>
    </div>
  );
}
