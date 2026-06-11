import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { rupiah, tglPendek } from "@/lib/format";
import { subtotalItem, totalItems } from "@/lib/pricing-calc";
import type { OrderView } from "@/lib/order-status";

// Palet brand (turunan token §8.3: hijau tua + amber + netral hangat).
const C = {
  brand: "#1f7a52",
  brandSoft: "#dcefe1",
  accent: "#c77d2e",
  ink: "#26303a",
  sub: "#6b7280",
  border: "#d9d6cf",
  head: "#efece6",
  zebra: "#f6f5f2",
};

const s = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 46,
    paddingHorizontal: 36,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: C.ink,
  },
  band: {
    backgroundColor: C.brand,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 5,
  },
  brandName: { fontFamily: "Helvetica-Bold", fontSize: 14, color: "#ffffff" },
  brandSub: { fontSize: 8, color: C.brandSoft, marginTop: 2 },
  docTitle: { fontFamily: "Helvetica-Bold", fontSize: 17, color: "#ffffff", textTransform: "uppercase" },
  docNo: { fontFamily: "Courier", fontSize: 9, color: C.brandSoft, textAlign: "right", marginTop: 2 },

  metaRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 16 },
  metaItem: { width: "50%", flexDirection: "row", marginBottom: 4 },
  metaLabel: { color: C.sub, width: 80 },
  metaVal: { fontFamily: "Helvetica-Bold", flex: 1 },

  sectionTitle: {
    marginTop: 16,
    marginBottom: 6,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    letterSpacing: 1,
    color: C.sub,
    textTransform: "uppercase",
  },

  table: { borderWidth: 1, borderColor: C.border, borderRadius: 5, overflow: "hidden" },
  thead: { flexDirection: "row", backgroundColor: C.head },
  tr: { flexDirection: "row", borderTopWidth: 1, borderColor: C.border },
  trZebra: { flexDirection: "row", borderTopWidth: 1, borderColor: C.border, backgroundColor: C.zebra },
  th: { paddingVertical: 6, paddingHorizontal: 7, fontFamily: "Helvetica-Bold", fontSize: 8.5, color: C.sub },
  td: { paddingVertical: 6, paddingHorizontal: 7 },
  num: { fontFamily: "Courier", textAlign: "right" },
  bold: { fontFamily: "Helvetica-Bold" },

  totalWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 12 },
  totalBox: {
    flexDirection: "row",
    backgroundColor: C.brand,
    borderRadius: 5,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  totalLabel: { color: C.brandSoft, fontSize: 9, marginRight: 16 },
  totalVal: { color: "#ffffff", fontFamily: "Courier", fontSize: 13 },

  amountBox: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: C.border,
    borderLeftWidth: 4,
    borderLeftColor: C.brand,
    borderRadius: 5,
    padding: 16,
    backgroundColor: C.zebra,
  },
  amountBig: { fontFamily: "Courier", fontSize: 22, color: C.ink, marginTop: 4 },

  signRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 40 },
  signBox: { width: 170 },
  signLine: { marginTop: 40, borderTopWidth: 1, borderColor: C.ink, paddingTop: 3, textAlign: "center", color: C.sub, fontSize: 9 },

  checkbox: { width: 12, height: 12, borderWidth: 1, borderColor: C.sub, borderRadius: 2, alignSelf: "center" },

  footer: {
    position: "absolute",
    bottom: 22,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderColor: C.border,
    paddingTop: 6,
    fontSize: 8,
    color: C.sub,
  },
});

function Kop({
  title,
  docNo,
  meta,
}: {
  title: string;
  docNo: string;
  meta: { label: string; value: string }[];
}) {
  return (
    <>
      <View style={s.band}>
        <View>
          <Text style={s.brandName}>Aice Distributor FMCG</Text>
          <Text style={s.brandSub}>Jl. Raya Darmo 12, Surabaya · Jawa Timur</Text>
        </View>
        <View>
          <Text style={s.docTitle}>{title}</Text>
          <Text style={s.docNo}>{docNo}</Text>
        </View>
      </View>
      <View style={s.metaRow}>
        {meta.map((m) => (
          <View key={m.label} style={s.metaItem}>
            <Text style={s.metaLabel}>{m.label}</Text>
            <Text style={s.metaVal}>{m.value}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

function Footer() {
  return (
    <View style={s.footer} fixed>
      <Text>Dokumen dihasilkan otomatis oleh Konsol Aice — sah tanpa tanda tangan basah.</Text>
      <Text render={({ pageNumber, totalPages }) => `Hal ${pageNumber}/${totalPages}`} />
    </View>
  );
}

function diskonLabel(dp: number, dr: number) {
  const p: string[] = [];
  if (dp > 0) p.push(`${dp}%`);
  if (dr > 0) p.push(`${rupiah(dr)}/unit`);
  return p.length ? p.join(" + ") : "—";
}

const orderMeta = (o: OrderView) => [
  { label: "Toko", value: o.tokoNama },
  { label: "Cabang", value: o.cabangNama },
  { label: "Tanggal", value: tglPendek(o.tanggal) },
  { label: "Sales", value: o.salesNama },
];

// ── Faktur ───────────────────────────────────────────────────────────────────
function FakturDoc({ o }: { o: OrderView }) {
  const kanvas = o.tipe === "kanvas";
  return (
    <Document title={`Faktur INV-${o.id}`}>
      <Page size="A4" style={s.page}>
        <Kop
          title={kanvas ? "Faktur Kanvas" : "Faktur"}
          docNo={`INV-${o.id}`}
          meta={orderMeta(o)}
        />
        <Text style={s.sectionTitle}>Rincian Barang</Text>
        <View style={s.table}>
          <View style={s.thead}>
            <Text style={[s.th, { flex: 3 }]}>Produk</Text>
            <Text style={[s.th, { flex: 1, textAlign: "right" }]}>Qty</Text>
            <Text style={[s.th, { flex: 2, textAlign: "right" }]}>Harga</Text>
            <Text style={[s.th, { flex: 2, textAlign: "right" }]}>Diskon</Text>
            <Text style={[s.th, { flex: 2, textAlign: "right" }]}>Subtotal</Text>
          </View>
          {o.items.map((i, idx) => (
            <View key={i.produkId} style={idx % 2 ? s.trZebra : s.tr}>
              <Text style={[s.td, { flex: 3 }]}>{i.nama} / {i.satuan}</Text>
              <Text style={[s.td, s.num, { flex: 1 }]}>{i.qty}</Text>
              <Text style={[s.td, s.num, { flex: 2 }]}>{rupiah(i.hargaSatuan)}</Text>
              <Text style={[s.td, { flex: 2, textAlign: "right", fontSize: 9 }]}>{diskonLabel(i.diskonPersen, i.diskonRupiah)}</Text>
              <Text style={[s.td, s.num, s.bold, { flex: 2 }]}>{rupiah(subtotalItem(i))}</Text>
            </View>
          ))}
        </View>
        <View style={s.totalWrap}>
          <View style={s.totalBox}>
            <Text style={s.totalLabel}>TOTAL</Text>
            <Text style={s.totalVal}>{rupiah(totalItems(o.items))}</Text>
          </View>
        </View>
        <View style={s.signRow}>
          <View style={s.signBox}><Text style={s.signLine}>{kanvas ? "Hormat kami (Sales Kanvas)" : "Hormat kami (Fakturist)"}</Text></View>
          <View style={s.signBox}><Text style={s.signLine}>Penerima (Toko)</Text></View>
        </View>
        <Footer />
      </Page>
    </Document>
  );
}

// ── Pick List ──────────────────────────────────────────────────────────────
function PickListDoc({ o }: { o: OrderView }) {
  return (
    <Document title={`Pick List PL-${o.id}`}>
      <Page size="A4" style={s.page}>
        <Kop title="Pick List" docNo={`PL-${o.id}`} meta={orderMeta(o)} />
        <Text style={s.sectionTitle}>Daftar Ambil Barang</Text>
        <View style={s.table}>
          <View style={s.thead}>
            <Text style={[s.th, { flex: 2 }]}>SKU</Text>
            <Text style={[s.th, { flex: 4 }]}>Produk</Text>
            <Text style={[s.th, { flex: 1, textAlign: "right" }]}>Qty</Text>
            <Text style={[s.th, { flex: 2 }]}>Satuan</Text>
            <Text style={[s.th, { flex: 1, textAlign: "center" }]}>Ambil</Text>
          </View>
          {o.items.map((i, idx) => (
            <View key={i.produkId} style={idx % 2 ? s.trZebra : s.tr}>
              <Text style={[s.td, { flex: 2, fontFamily: "Courier" }]}>{i.sku}</Text>
              <Text style={[s.td, { flex: 4 }]}>{i.nama}</Text>
              <Text style={[s.td, s.num, s.bold, { flex: 1 }]}>{i.qty}</Text>
              <Text style={[s.td, { flex: 2 }]}>{i.satuan}</Text>
              <View style={[s.td, { flex: 1, alignItems: "center" }]}><View style={s.checkbox} /></View>
            </View>
          ))}
        </View>
        <View style={s.signRow}>
          <View style={s.signBox}><Text style={s.signLine}>Disiapkan (Gudang)</Text></View>
          <View style={s.signBox}><Text style={s.signLine}>Diperiksa (Fakturist)</Text></View>
        </View>
        <Footer />
      </Page>
    </Document>
  );
}

// ── Rekap Nota & Barang (Gudang) ─────────────────────────────────────────────
function RekapDoc({ orders, cabangNama, tanggal }: { orders: OrderView[]; cabangNama: string; tanggal: string }) {
  const totalNilai = orders.reduce((sm, o) => sm + totalItems(o.items), 0);
  // Agregasi barang per produk lintas order.
  const agg = new Map<string, { nama: string; satuan: string; qty: number }>();
  for (const o of orders)
    for (const it of o.items) {
      const k = it.nama;
      const cur = agg.get(k) ?? { nama: it.nama, satuan: it.satuan, qty: 0 };
      cur.qty += it.qty;
      agg.set(k, cur);
    }
  const barang = [...agg.values()].sort((a, b) => a.nama.localeCompare(b.nama));

  return (
    <Document title="Rekap Kirim">
      <Page size="A4" style={s.page}>
        <Kop title="Rekap Kirim" docNo={`RK-${tanggal}`} meta={[{ label: "Cabang", value: cabangNama }, { label: "Tanggal", value: tglPendek(`${tanggal}T00:00:00`) }, { label: "Jumlah Nota", value: String(orders.length) }]} />

        <Text style={s.sectionTitle}>Rekap Nota</Text>
        <View style={s.table}>
          <View style={s.thead}>
            <Text style={[s.th, { flex: 1 }]}>Order</Text>
            <Text style={[s.th, { flex: 4 }]}>Toko</Text>
            <Text style={[s.th, { flex: 1, textAlign: "right" }]}>Item</Text>
            <Text style={[s.th, { flex: 2, textAlign: "right" }]}>Nilai</Text>
          </View>
          {orders.map((o, idx) => (
            <View key={o.id} style={idx % 2 ? s.trZebra : s.tr}>
              <Text style={[s.td, { flex: 1, fontFamily: "Courier" }]}>#{o.id}</Text>
              <Text style={[s.td, { flex: 4 }]}>{o.tokoNama}</Text>
              <Text style={[s.td, s.num, { flex: 1 }]}>{o.items.reduce((a, i) => a + i.qty, 0)}</Text>
              <Text style={[s.td, s.num, { flex: 2 }]}>{rupiah(totalItems(o.items))}</Text>
            </View>
          ))}
        </View>
        <View style={s.totalWrap}>
          <View style={s.totalBox}>
            <Text style={s.totalLabel}>TOTAL NILAI</Text>
            <Text style={s.totalVal}>{rupiah(totalNilai)}</Text>
          </View>
        </View>

        <Text style={s.sectionTitle}>Rekap Barang (Agregat)</Text>
        <View style={s.table}>
          <View style={s.thead}>
            <Text style={[s.th, { flex: 5 }]}>Produk</Text>
            <Text style={[s.th, { flex: 2, textAlign: "right" }]}>Total Qty</Text>
            <Text style={[s.th, { flex: 2 }]}>Satuan</Text>
          </View>
          {barang.map((b, idx) => (
            <View key={b.nama} style={idx % 2 ? s.trZebra : s.tr}>
              <Text style={[s.td, { flex: 5 }]}>{b.nama}</Text>
              <Text style={[s.td, s.num, s.bold, { flex: 2 }]}>{b.qty}</Text>
              <Text style={[s.td, { flex: 2 }]}>{b.satuan}</Text>
            </View>
          ))}
        </View>
        <Footer />
      </Page>
    </Document>
  );
}

// ── Bukti Pelunasan / Kwitansi (Incaso) ──────────────────────────────────────
function KwitansiDoc({ o, jumlah, metode }: { o: OrderView; jumlah: number; metode: string }) {
  return (
    <Document title={`Kwitansi KW-${o.id}`}>
      <Page size="A4" style={s.page}>
        <Kop
          title="Bukti Pelunasan"
          docNo={`KW-${o.id}`}
          meta={[
            { label: "Diterima dari", value: o.tokoNama },
            { label: "Cabang", value: o.cabangNama },
            { label: "Tanggal", value: tglPendek(o.tanggal) },
            { label: "Metode", value: metode.toUpperCase() },
          ]}
        />
        <View style={s.amountBox}>
          <Text style={{ color: C.sub, fontSize: 9 }}>Telah diterima pembayaran sebesar</Text>
          <Text style={s.amountBig}>{rupiah(jumlah)}</Text>
          <Text style={{ color: C.sub, fontSize: 9, marginTop: 6 }}>
            Untuk pelunasan Order #{o.id} — {o.tokoNama}.
          </Text>
        </View>
        <View style={[s.signRow, { justifyContent: "flex-end" }]}>
          <View style={s.signBox}><Text style={s.signLine}>Penerima (Incaso)</Text></View>
        </View>
        <Footer />
      </Page>
    </Document>
  );
}

// ── Aggregate Pick List (Gudang — gabungan semua nota belum di-pick-list) ────
function AggPickListDoc({ orders, cabangNama, tanggal }: { orders: OrderView[]; cabangNama: string; tanggal: string }) {
  // Agregasi total qty per SKU dari seluruh nota.
  const agg = new Map<string, { sku: string; nama: string; satuan: string; totalQty: number }>();
  for (const o of orders)
    for (const it of o.items) {
      const cur = agg.get(it.sku) ?? { sku: it.sku, nama: it.nama, satuan: it.satuan, totalQty: 0 };
      cur.totalQty += it.qty;
      agg.set(it.sku, cur);
    }
  const baris = [...agg.values()].sort((a, b) => a.sku.localeCompare(b.sku));
  const orderIds = orders.map((o) => `#${o.id}`).join(", ");

  return (
    <Document title={`Pick List Gabungan PLA-${tanggal}`}>
      <Page size="A4" style={s.page}>
        <Kop
          title="Pick List Gabungan"
          docNo={`PLA-${tanggal}`}
          meta={[
            { label: "Cabang", value: cabangNama },
            { label: "Tanggal", value: tglPendek(`${tanggal}T00:00:00`) },
            { label: "Jml Nota", value: String(orders.length) },
            { label: "SKU Unik", value: String(baris.length) },
          ]}
        />
        <Text style={s.sectionTitle}>Daftar Ambil Barang (Agregat)</Text>
        <View style={s.table}>
          <View style={s.thead}>
            <Text style={[s.th, { flex: 2 }]}>SKU</Text>
            <Text style={[s.th, { flex: 4 }]}>Produk</Text>
            <Text style={[s.th, { flex: 1, textAlign: "right" }]}>Total Qty</Text>
            <Text style={[s.th, { flex: 2 }]}>Satuan</Text>
            <Text style={[s.th, { flex: 1, textAlign: "center" }]}>Ambil</Text>
          </View>
          {baris.map((b, idx) => (
            <View key={b.sku} style={idx % 2 ? s.trZebra : s.tr}>
              <Text style={[s.td, { flex: 2, fontFamily: "Courier" }]}>{b.sku}</Text>
              <Text style={[s.td, { flex: 4 }]}>{b.nama}</Text>
              <Text style={[s.td, s.num, s.bold, { flex: 1 }]}>{b.totalQty}</Text>
              <Text style={[s.td, { flex: 2 }]}>{b.satuan}</Text>
              <View style={[s.td, { flex: 1, alignItems: "center" }]}><View style={s.checkbox} /></View>
            </View>
          ))}
        </View>
        <View style={s.signRow}>
          <View style={s.signBox}><Text style={s.signLine}>Disiapkan (Gudang)</Text></View>
          <View style={s.signBox}><Text style={s.signLine}>Diperiksa (Fakturist)</Text></View>
        </View>
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 8, color: C.sub }}>Dari nota: {orderIds}</Text>
        </View>
        <Footer />
      </Page>
    </Document>
  );
}

// ── Render helpers (server) ──────────────────────────────────────────────────
export const renderFakturPdf = (o: OrderView) => renderToBuffer(<FakturDoc o={o} />);
export const renderPickListPdf = (o: OrderView) => renderToBuffer(<PickListDoc o={o} />);
export const renderRekapPdf = (orders: OrderView[], cabangNama: string, tanggal: string) =>
  renderToBuffer(<RekapDoc orders={orders} cabangNama={cabangNama} tanggal={tanggal} />);
export const renderKwitansiPdf = (o: OrderView, jumlah: number, metode: string) =>
  renderToBuffer(<KwitansiDoc o={o} jumlah={jumlah} metode={metode} />);
export const renderAggPickListPdf = (orders: OrderView[], cabangNama: string, tanggal: string) =>
  renderToBuffer(<AggPickListDoc orders={orders} cabangNama={cabangNama} tanggal={tanggal} />);
