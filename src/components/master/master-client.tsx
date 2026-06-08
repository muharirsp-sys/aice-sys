"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/ui/data-table";
import { btn, input, label } from "@/lib/ui";
import { rupiah } from "@/lib/format";
import {
  upsertProduk,
  upsertCabang,
  upsertToko,
  upsertHarga,
  upsertDiskon,
} from "@/server/master-actions";

type Result = { ok: boolean; error?: string };

function useSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  function run(fn: () => Promise<Result>, onOk: () => void) {
    setErr(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setErr(r.error ?? "Gagal.");
      else {
        onOk();
        router.refresh();
      }
    });
  }
  return { pending, err, setErr, run };
}

function SectionShell({
  title,
  onAdd,
  children,
}: {
  title: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        <button className={btn.outline} onClick={onAdd}>
          <Plus className="size-4" /> Tambah
        </button>
      </div>
      {children}
    </section>
  );
}

function Field({
  label: l,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <label className={label}>{l}</label>
      {children}
    </div>
  );
}

// ── Produk ───────────────────────────────────────────────────────────────────
type Produk = { id: number; nama: string; sku: string; satuan: string };
export function MasterProduk({ rows }: { rows: Produk[] }) {
  const { pending, err, setErr, run } = useSave();
  const [edit, setEdit] = useState<Produk | null>(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ nama: "", sku: "", satuan: "" });

  function openForm(p?: Produk) {
    setErr(null);
    setEdit(p ?? null);
    setF(p ? { nama: p.nama, sku: p.sku, satuan: p.satuan } : { nama: "", sku: "", satuan: "" });
    setOpen(true);
  }
  const cols: Column<Produk>[] = [
    { header: "Nama", cell: (r) => r.nama },
    { header: "SKU", cell: (r) => <span className="tabular">{r.sku}</span> },
    { header: "Satuan", cell: (r) => r.satuan },
    { header: "", align: "right", cell: (r) => <button className={btn.ghost} onClick={() => openForm(r)}><Pencil className="size-4" /></button> },
  ];
  return (
    <SectionShell title="Produk" onAdd={() => openForm()}>
      <DataTable columns={cols} rows={rows} getRowKey={(r) => r.id} />
      <Dialog open={open} onClose={() => setOpen(false)} title={edit ? `Edit Produk` : "Produk Baru"}>
        {err && <p className="mb-3 text-sm font-semibold text-critical">{err}</p>}
        <Field label="Nama"><input className={input} value={f.nama} onChange={(e) => setF({ ...f, nama: e.target.value })} /></Field>
        <Field label="SKU"><input className={input} value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} /></Field>
        <Field label="Satuan"><input className={input} value={f.satuan} onChange={(e) => setF({ ...f, satuan: e.target.value })} placeholder="dus / karton / sak" /></Field>
        <button className={btn.primary} disabled={pending} onClick={() => run(() => upsertProduk({ id: edit?.id, ...f }), () => setOpen(false))}>Simpan</button>
      </Dialog>
    </SectionShell>
  );
}

// ── Cabang ───────────────────────────────────────────────────────────────────
type Cabang = { id: number; nama: string; alamat: string };
export function MasterCabang({ rows }: { rows: Cabang[] }) {
  const { pending, err, setErr, run } = useSave();
  const [edit, setEdit] = useState<Cabang | null>(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ nama: "", alamat: "" });
  function openForm(c?: Cabang) {
    setErr(null);
    setEdit(c ?? null);
    setF(c ? { nama: c.nama, alamat: c.alamat } : { nama: "", alamat: "" });
    setOpen(true);
  }
  const cols: Column<Cabang>[] = [
    { header: "Nama", cell: (r) => r.nama },
    { header: "Alamat", cell: (r) => <span className="text-muted-foreground">{r.alamat}</span> },
    { header: "", align: "right", cell: (r) => <button className={btn.ghost} onClick={() => openForm(r)}><Pencil className="size-4" /></button> },
  ];
  return (
    <SectionShell title="Cabang" onAdd={() => openForm()}>
      <DataTable columns={cols} rows={rows} getRowKey={(r) => r.id} />
      <Dialog open={open} onClose={() => setOpen(false)} title={edit ? "Edit Cabang" : "Cabang Baru"}>
        {err && <p className="mb-3 text-sm font-semibold text-critical">{err}</p>}
        <Field label="Nama"><input className={input} value={f.nama} onChange={(e) => setF({ ...f, nama: e.target.value })} /></Field>
        <Field label="Alamat"><input className={input} value={f.alamat} onChange={(e) => setF({ ...f, alamat: e.target.value })} /></Field>
        <button className={btn.primary} disabled={pending} onClick={() => run(() => upsertCabang({ id: edit?.id, ...f }), () => setOpen(false))}>Simpan</button>
      </Dialog>
    </SectionShell>
  );
}

// ── Toko ─────────────────────────────────────────────────────────────────────
type TokoRow = { id: number; nama: string; alamat: string | null; noTelp: string | null; cabangId: number; cabangNama: string };
export function MasterToko({ rows, cabangs }: { rows: TokoRow[]; cabangs: { id: number; nama: string }[] }) {
  const { pending, err, setErr, run } = useSave();
  const [edit, setEdit] = useState<TokoRow | null>(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ nama: "", alamat: "", noTelp: "", cabangId: cabangs[0]?.id ?? 0 });
  function openForm(t?: TokoRow) {
    setErr(null);
    setEdit(t ?? null);
    setF(t ? { nama: t.nama, alamat: t.alamat ?? "", noTelp: t.noTelp ?? "", cabangId: t.cabangId } : { nama: "", alamat: "", noTelp: "", cabangId: cabangs[0]?.id ?? 0 });
    setOpen(true);
  }
  const cols: Column<TokoRow>[] = [
    { header: "Nama", cell: (r) => r.nama },
    { header: "Cabang", cell: (r) => r.cabangNama },
    { header: "Telp", cell: (r) => <span className="tabular text-muted-foreground">{r.noTelp ?? "-"}</span> },
    { header: "", align: "right", cell: (r) => <button className={btn.ghost} onClick={() => openForm(r)}><Pencil className="size-4" /></button> },
  ];
  return (
    <SectionShell title="Toko" onAdd={() => openForm()}>
      <DataTable columns={cols} rows={rows} getRowKey={(r) => r.id} />
      <Dialog open={open} onClose={() => setOpen(false)} title={edit ? "Edit Toko" : "Toko Baru"}>
        {err && <p className="mb-3 text-sm font-semibold text-critical">{err}</p>}
        <Field label="Nama"><input className={input} value={f.nama} onChange={(e) => setF({ ...f, nama: e.target.value })} /></Field>
        <Field label="Cabang">
          <select className={input} value={f.cabangId} onChange={(e) => setF({ ...f, cabangId: Number(e.target.value) })}>
            {cabangs.map((c) => <option key={c.id} value={c.id}>{c.nama}</option>)}
          </select>
        </Field>
        <Field label="Alamat"><input className={input} value={f.alamat} onChange={(e) => setF({ ...f, alamat: e.target.value })} /></Field>
        <Field label="No. Telp"><input className={input} value={f.noTelp} onChange={(e) => setF({ ...f, noTelp: e.target.value })} /></Field>
        <button className={btn.primary} disabled={pending} onClick={() => run(() => upsertToko({ id: edit?.id, ...f }), () => setOpen(false))}>Simpan</button>
      </Dialog>
    </SectionShell>
  );
}

// ── Harga Cabang ──────────────────────────────────────────────────────────────
type HargaRow = { id: number; produkId: number; cabangId: number; harga: number; produkNama: string; cabangNama: string };
export function MasterHarga({ rows, produks, cabangs }: { rows: HargaRow[]; produks: { id: number; nama: string }[]; cabangs: { id: number; nama: string }[] }) {
  const { pending, err, setErr, run } = useSave();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ produkId: produks[0]?.id ?? 0, cabangId: cabangs[0]?.id ?? 0, harga: 0 });
  function openForm(r?: HargaRow) {
    setErr(null);
    setF(r ? { produkId: r.produkId, cabangId: r.cabangId, harga: r.harga } : { produkId: produks[0]?.id ?? 0, cabangId: cabangs[0]?.id ?? 0, harga: 0 });
    setOpen(true);
  }
  const cols: Column<HargaRow>[] = [
    { header: "Cabang", cell: (r) => r.cabangNama },
    { header: "Produk", cell: (r) => r.produkNama },
    { header: "Harga", align: "right", cell: (r) => rupiah(r.harga) },
    { header: "", align: "right", cell: (r) => <button className={btn.ghost} onClick={() => openForm(r)}><Pencil className="size-4" /></button> },
  ];
  return (
    <SectionShell title="Harga Dasar Cabang" onAdd={() => openForm()}>
      <DataTable columns={cols} rows={rows} getRowKey={(r) => r.id} />
      <Dialog open={open} onClose={() => setOpen(false)} title="Set Harga (per produk × cabang)">
        {err && <p className="mb-3 text-sm font-semibold text-critical">{err}</p>}
        <Field label="Produk">
          <select className={input} value={f.produkId} onChange={(e) => setF({ ...f, produkId: Number(e.target.value) })}>
            {produks.map((p) => <option key={p.id} value={p.id}>{p.nama}</option>)}
          </select>
        </Field>
        <Field label="Cabang">
          <select className={input} value={f.cabangId} onChange={(e) => setF({ ...f, cabangId: Number(e.target.value) })}>
            {cabangs.map((c) => <option key={c.id} value={c.id}>{c.nama}</option>)}
          </select>
        </Field>
        <Field label="Harga (Rp)"><input type="number" min={0} className={`${input} tabular`} value={f.harga} onChange={(e) => setF({ ...f, harga: Number(e.target.value) })} /></Field>
        <button className={btn.primary} disabled={pending} onClick={() => run(() => upsertHarga(f), () => setOpen(false))}>Simpan</button>
      </Dialog>
    </SectionShell>
  );
}

// ── Diskon Toko ──────────────────────────────────────────────────────────────
type DiskonRow = { id: number; tokoId: number; produkId: number; diskonPersen: number; diskonRupiah: number; batasPersen: number; batasRupiah: number; tokoNama: string; produkNama: string };
export function MasterDiskon({ rows, tokos, produks }: { rows: DiskonRow[]; tokos: { id: number; nama: string }[]; produks: { id: number; nama: string }[] }) {
  const { pending, err, setErr, run } = useSave();
  const [open, setOpen] = useState(false);
  const empty = { tokoId: tokos[0]?.id ?? 0, produkId: produks[0]?.id ?? 0, diskonPersen: 0, diskonRupiah: 0, batasPersen: 0, batasRupiah: 0 };
  const [f, setF] = useState(empty);
  function openForm(r?: DiskonRow) {
    setErr(null);
    setF(r ? { tokoId: r.tokoId, produkId: r.produkId, diskonPersen: r.diskonPersen, diskonRupiah: r.diskonRupiah, batasPersen: r.batasPersen, batasRupiah: r.batasRupiah } : empty);
    setOpen(true);
  }
  const cols: Column<DiskonRow>[] = [
    { header: "Toko", cell: (r) => r.tokoNama },
    { header: "Produk", cell: (r) => r.produkNama },
    { header: "Diskon", align: "right", cell: (r) => <span className="tabular">{r.diskonPersen}% / {rupiah(r.diskonRupiah)}</span> },
    { header: "Batas", align: "right", cell: (r) => <span className="tabular text-muted-foreground">{r.batasPersen}% / {rupiah(r.batasRupiah)}</span> },
    { header: "", align: "right", cell: (r) => <button className={btn.ghost} onClick={() => openForm(r)}><Pencil className="size-4" /></button> },
  ];
  const setN = (k: keyof typeof empty, v: string) => setF({ ...f, [k]: Number(v) });
  return (
    <SectionShell title="Diskon Khusus Toko" onAdd={() => openForm()}>
      <DataTable columns={cols} rows={rows} getRowKey={(r) => r.id} empty="Belum ada diskon khusus." />
      <Dialog open={open} onClose={() => setOpen(false)} title="Set Diskon (per toko × produk)">
        {err && <p className="mb-3 text-sm font-semibold text-critical">{err}</p>}
        <Field label="Toko">
          <select className={input} value={f.tokoId} onChange={(e) => setN("tokoId", e.target.value)}>
            {tokos.map((t) => <option key={t.id} value={t.id}>{t.nama}</option>)}
          </select>
        </Field>
        <Field label="Produk">
          <select className={input} value={f.produkId} onChange={(e) => setN("produkId", e.target.value)}>
            {produks.map((p) => <option key={p.id} value={p.id}>{p.nama}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Diskon %"><input type="number" min={0} className={`${input} tabular`} value={f.diskonPersen} onChange={(e) => setN("diskonPersen", e.target.value)} /></Field>
          <Field label="Diskon Rp/unit"><input type="number" min={0} className={`${input} tabular`} value={f.diskonRupiah} onChange={(e) => setN("diskonRupiah", e.target.value)} /></Field>
          <Field label="Batas %"><input type="number" min={0} className={`${input} tabular`} value={f.batasPersen} onChange={(e) => setN("batasPersen", e.target.value)} /></Field>
          <Field label="Batas Rp/unit"><input type="number" min={0} className={`${input} tabular`} value={f.batasRupiah} onChange={(e) => setN("batasRupiah", e.target.value)} /></Field>
        </div>
        <button className={btn.primary} disabled={pending} onClick={() => run(() => upsertDiskon(f), () => setOpen(false))}>Simpan</button>
      </Dialog>
    </SectionShell>
  );
}
