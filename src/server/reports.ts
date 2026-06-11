/*
Tujuan: Registry laporan Excel — memetakan setiap entitas (master & transaksi) ke daftar sheet.
Caller: Route handler /export/[entity]/route.ts.
Dependensi: Query master (queries.ts), query laporan (report-queries.ts), helper Excel.
Main Functions: getReport, REPORT_ENTITIES.
Side Effects: Membaca database via query yang dipanggil (read-only).
*/

import {
  listProdukAll,
  listCabangAll,
  listTokoAll,
  listHargaAll,
  listDiskonAll,
} from "@/server/queries";
import {
  listUsersAll,
  listPenjualan,
  listPembayaranAll,
  listPengirimanAll,
  listTripKanvasAll,
  listTripItemAll,
  listReturKanvas,
  listOrderDitolakResolved,
  listIssueAll,
  type ReportFilter,
} from "@/server/report-queries";
import {
  type Sheet,
  xlsxDateTime,
  yaTidak,
} from "@/lib/excel";

const RP = "#,##0";

// Sebuah laporan = judul + nama file + builder yang menghasilkan satu/lebih sheet.
// requiresGlobal : hanya owner/super_admin yang boleh mengunduh (data lintas-cabang).
// supportsFilter : laporan transaksi yang menerima filter (tanggal, cabang, toko, item).
// filterToko     : laporan ini bisa difilter per customer/toko.
// filterProduk   : laporan ini bisa difilter per item/produk.
export type ReportDef = {
  label: string; // teks tombol/halaman
  filename: string; // tanpa ekstensi & tanpa tanggal
  requiresGlobal?: boolean;
  supportsFilter?: boolean;
  filterToko?: boolean;
  filterProduk?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: (cabangId: number | null, filter: ReportFilter) => Promise<Sheet<any>[]>;
};

export const REPORTS = {
  // ── Master Data ────────────────────────────────────────────────────────────
  produk: {
    label: "Master Produk",
    filename: "master-produk",
    requiresGlobal: true,
    build: async () => {
      const rows = await listProdukAll();
      return [
        {
          name: "Produk",
          rows,
          columns: [
            { header: "ID", value: (r) => r.id, width: 8 },
            { header: "Nama Produk", value: (r) => r.nama, width: 32 },
            { header: "SKU", value: (r) => r.sku, width: 18 },
            { header: "Satuan", value: (r) => r.satuan, width: 14 },
          ],
        },
      ];
    },
  },

  cabang: {
    label: "Master Cabang",
    filename: "master-cabang",
    requiresGlobal: true,
    build: async () => {
      const rows = await listCabangAll();
      return [
        {
          name: "Cabang",
          rows,
          columns: [
            { header: "ID", value: (r) => r.id, width: 8 },
            { header: "Nama Cabang", value: (r) => r.nama, width: 28 },
            { header: "Alamat", value: (r) => r.alamat, width: 48 },
          ],
        },
      ];
    },
  },

  toko: {
    label: "Master Toko",
    filename: "master-toko",
    requiresGlobal: true,
    build: async (cabangId) => {
      let rows = await listTokoAll();
      if (cabangId != null) rows = rows.filter((r) => r.cabangId === cabangId);
      return [
        {
          name: "Toko",
          rows,
          columns: [
            { header: "ID", value: (r) => r.id, width: 8 },
            { header: "Nama Toko", value: (r) => r.nama, width: 30 },
            { header: "Cabang", value: (r) => r.cabangNama, width: 22 },
            { header: "Alamat", value: (r) => r.alamat ?? "-", width: 40 },
            { header: "No. Telp", value: (r) => r.noTelp ?? "-", width: 18 },
          ],
        },
      ];
    },
  },

  harga: {
    label: "Harga Dasar Cabang",
    filename: "master-harga-cabang",
    requiresGlobal: true,
    build: async (cabangId) => {
      let rows = await listHargaAll();
      if (cabangId != null) rows = rows.filter((r) => r.cabangId === cabangId);
      return [
        {
          name: "Harga Cabang",
          rows,
          columns: [
            { header: "ID", value: (r) => r.id, width: 8 },
            { header: "Cabang", value: (r) => r.cabangNama, width: 22 },
            { header: "Produk", value: (r) => r.produkNama, width: 32 },
            { header: "Harga", value: (r) => r.harga, width: 16, numFmt: RP },
          ],
        },
      ];
    },
  },

  diskon: {
    label: "Diskon Khusus Toko",
    filename: "master-diskon-toko",
    requiresGlobal: true,
    build: async () => {
      const rows = await listDiskonAll();
      return [
        {
          name: "Diskon Toko",
          rows,
          columns: [
            { header: "ID", value: (r) => r.id, width: 8 },
            { header: "Toko", value: (r) => r.tokoNama, width: 30 },
            { header: "Produk", value: (r) => r.produkNama, width: 32 },
            { header: "Diskon %", value: (r) => r.diskonPersen, width: 12 },
            { header: "Diskon Rp/unit", value: (r) => r.diskonRupiah, width: 16, numFmt: RP },
            { header: "Batas %", value: (r) => r.batasPersen, width: 12 },
            { header: "Batas Rp/unit", value: (r) => r.batasRupiah, width: 16, numFmt: RP },
          ],
        },
      ];
    },
  },

  user: {
    label: "Master Pengguna",
    filename: "master-pengguna",
    requiresGlobal: true,
    build: async (cabangId) => {
      const rows = await listUsersAll(cabangId);
      return [
        {
          name: "Pengguna",
          rows,
          columns: [
            { header: "ID", value: (r) => r.id, width: 8 },
            { header: "Nama", value: (r) => r.nama, width: 28 },
            { header: "Email", value: (r) => r.email, width: 30 },
            { header: "Role", value: (r) => r.roleNama, width: 18 },
            { header: "Cabang", value: (r) => r.cabangNama, width: 22 },
            { header: "Dibuat", value: (r) => xlsxDateTime(r.dibuat), width: 20 },
          ],
        },
      ];
    },
  },

  // ── Transaksi ──────────────────────────────────────────────────────────────
  penjualan: {
    label: "Penjualan (Order)",
    filename: "laporan-penjualan",
    supportsFilter: true,
    filterToko: true,
    filterProduk: true,
    build: async (cabangId, filter) => {
      const { headers, items } = await listPenjualan(cabangId, filter);
      return [
        {
          name: "Ringkasan Order",
          rows: headers,
          columns: [
            { header: "ID Order", value: (r) => r.id, width: 10 },
            { header: "Tanggal", value: (r) => xlsxDateTime(r.tanggal), width: 20 },
            { header: "Toko", value: (r) => r.tokoNama, width: 28 },
            { header: "Cabang", value: (r) => r.cabangNama, width: 20 },
            { header: "Sales", value: (r) => r.salesNama, width: 22 },
            { header: "Tipe", value: (r) => r.tipe, width: 16 },
            { header: "Status", value: (r) => r.status, width: 16 },
            { header: "Jumlah Item", value: (r) => r.jumlahItem, width: 12 },
            { header: "Total", value: (r) => r.total, width: 18, numFmt: RP },
          ],
        },
        {
          name: "Detail Item",
          rows: items,
          columns: [
            { header: "ID Order", value: (r) => r.orderId, width: 10 },
            { header: "Tanggal", value: (r) => xlsxDateTime(r.tanggal), width: 20 },
            { header: "Toko", value: (r) => r.tokoNama, width: 28 },
            { header: "Cabang", value: (r) => r.cabangNama, width: 20 },
            { header: "Produk", value: (r) => r.produkNama, width: 32 },
            { header: "SKU", value: (r) => r.sku, width: 16 },
            { header: "Satuan", value: (r) => r.satuan, width: 12 },
            { header: "Qty", value: (r) => r.qty, width: 10 },
            { header: "Harga Satuan", value: (r) => r.hargaSatuan, width: 16, numFmt: RP },
            { header: "Diskon %", value: (r) => r.diskonPersen, width: 12 },
            { header: "Diskon Rp/unit", value: (r) => r.diskonRupiah, width: 16, numFmt: RP },
            { header: "Subtotal", value: (r) => r.subtotal, width: 18, numFmt: RP },
          ],
        },
      ];
    },
  },

  pembayaran: {
    label: "Pembayaran",
    filename: "laporan-pembayaran",
    supportsFilter: true,
    filterToko: true,
    build: async (cabangId, filter) => {
      const rows = await listPembayaranAll(cabangId, filter);
      return [
        {
          name: "Pembayaran",
          rows,
          columns: [
            { header: "ID", value: (r) => r.id, width: 8 },
            { header: "ID Order", value: (r) => r.orderId, width: 10 },
            { header: "Toko", value: (r) => r.tokoNama, width: 28 },
            { header: "Cabang", value: (r) => r.cabangNama, width: 20 },
            { header: "Tgl Bayar", value: (r) => xlsxDateTime(r.tanggalBayar), width: 20 },
            { header: "Jumlah", value: (r) => r.jumlah, width: 18, numFmt: RP },
            { header: "Metode", value: (r) => r.metode, width: 14 },
            { header: "Incaso", value: (r) => r.incasoNama, width: 22 },
            { header: "Bukti Bayar URL", value: (r) => r.buktiBayarUrl ?? "-", width: 40 },
          ],
        },
      ];
    },
  },

  pengantaran: {
    label: "Pengantaran",
    filename: "laporan-pengantaran",
    supportsFilter: true,
    filterToko: true,
    build: async (cabangId, filter) => {
      const rows = await listPengirimanAll(cabangId, filter);
      return [
        {
          name: "Pengantaran",
          rows,
          columns: [
            { header: "ID", value: (r) => r.id, width: 8 },
            { header: "ID Order", value: (r) => r.orderId, width: 10 },
            { header: "Toko", value: (r) => r.tokoNama, width: 28 },
            { header: "Alamat", value: (r) => r.tokoAlamat ?? "-", width: 40 },
            { header: "Cabang", value: (r) => r.cabangNama, width: 20 },
            { header: "Delivery", value: (r) => r.deliveryNama, width: 22 },
            { header: "Dikirim", value: (r) => xlsxDateTime(r.dikirim), width: 20 },
            { header: "Diterima", value: (r) => xlsxDateTime(r.diterima), width: 20 },
            { header: "GPS", value: (r) => r.gpsCoord ?? "-", width: 22 },
            { header: "Bukti Terima URL", value: (r) => r.buktiTerimaUrl ?? "-", width: 40 },
          ],
        },
      ];
    },
  },

  mutasi: {
    label: "Mutasi (Trip Kanvas)",
    filename: "laporan-mutasi-kanvas",
    supportsFilter: true,
    filterProduk: true,
    build: async (cabangId, filter) => {
      const [trips, items] = await Promise.all([
        listTripKanvasAll(cabangId, filter),
        listTripItemAll(cabangId, filter),
      ]);
      return [
        {
          name: "Trip Kanvas",
          rows: trips,
          columns: [
            { header: "ID Trip", value: (r) => r.id, width: 10 },
            { header: "Tujuan", value: (r) => r.tujuan, width: 28 },
            { header: "Status", value: (r) => r.status, width: 16 },
            { header: "Sales", value: (r) => r.salesNama, width: 22 },
            { header: "Cabang", value: (r) => r.cabangNama, width: 20 },
            { header: "Berangkat", value: (r) => xlsxDateTime(r.tanggalBerangkat), width: 20 },
            { header: "Kembali", value: (r) => xlsxDateTime(r.tanggalKembali), width: 20 },
            { header: "Gudang Muat", value: (r) => r.gudangMuatNama ?? "-", width: 22 },
            { header: "Gudang Rekon", value: (r) => r.gudangRekonNama ?? "-", width: 22 },
            { header: "Catatan Selisih", value: (r) => r.catatanSelisih ?? "-", width: 40 },
            { header: "Dibuat", value: (r) => xlsxDateTime(r.createdAt), width: 20 },
          ],
        },
        {
          name: "Item Muatan",
          rows: items,
          columns: [
            { header: "ID Trip", value: (r) => r.tripId, width: 10 },
            { header: "Tujuan", value: (r) => r.tujuan, width: 24 },
            { header: "Status", value: (r) => r.status, width: 14 },
            { header: "Sales", value: (r) => r.salesNama, width: 22 },
            { header: "Cabang", value: (r) => r.cabangNama, width: 20 },
            { header: "Produk", value: (r) => r.produkNama, width: 32 },
            { header: "SKU", value: (r) => r.sku, width: 16 },
            { header: "Satuan", value: (r) => r.satuan, width: 12 },
            { header: "Qty Muat", value: (r) => r.qtyMuat, width: 12 },
            { header: "Qty Kembali", value: (r) => r.qtyKembali ?? 0, width: 12 },
            { header: "Qty Terjual", value: (r) => r.qtyMuat - (r.qtyKembali ?? 0), width: 12 },
          ],
        },
      ];
    },
  },

  retur: {
    label: "Retur",
    filename: "laporan-retur",
    supportsFilter: true,
    filterToko: true,
    filterProduk: true,
    build: async (cabangId, filter) => {
      const [kanvas, ditolak] = await Promise.all([
        listReturKanvas(cabangId, filter),
        listOrderDitolakResolved(cabangId, filter),
      ]);
      return [
        {
          name: "Retur Kanvas",
          rows: kanvas,
          columns: [
            { header: "ID Trip", value: (r) => r.tripId, width: 10 },
            { header: "Tujuan", value: (r) => r.tujuan, width: 26 },
            { header: "Sales", value: (r) => r.salesNama, width: 22 },
            { header: "Cabang", value: (r) => r.cabangNama, width: 20 },
            { header: "Produk", value: (r) => r.produkNama, width: 32 },
            { header: "SKU", value: (r) => r.sku, width: 16 },
            { header: "Satuan", value: (r) => r.satuan, width: 12 },
            { header: "Qty Muat", value: (r) => r.qtyMuat, width: 12 },
            { header: "Qty Kembali", value: (r) => r.qtyKembali ?? 0, width: 12 },
            { header: "Tgl Kembali", value: (r) => xlsxDateTime(r.tanggalKembali), width: 20 },
          ],
        },
        {
          name: "Order Ditolak",
          rows: ditolak,
          columns: [
            { header: "ID Order", value: (r) => r.orderId, width: 10 },
            { header: "Tanggal", value: (r) => xlsxDateTime(r.tanggal), width: 20 },
            { header: "Toko", value: (r) => r.tokoNama, width: 28 },
            { header: "Cabang", value: (r) => r.cabangNama, width: 20 },
            { header: "Sales", value: (r) => r.salesNama, width: 22 },
            { header: "Ditolak Oleh", value: (r) => r.adminNama, width: 22 },
            { header: "Alasan Tolak", value: (r) => r.alasanTolak ?? "-", width: 40 },
            { header: "Ditolak Pada", value: (r) => xlsxDateTime(r.ditolakPada), width: 20 },
          ],
        },
      ];
    },
  },

  kendala: {
    label: "Kendala / Selisih",
    filename: "laporan-kendala",
    supportsFilter: true,
    filterToko: true,
    build: async (cabangId, filter) => {
      const rows = await listIssueAll(cabangId, filter);
      return [
        {
          name: "Kendala",
          rows,
          columns: [
            { header: "ID", value: (r) => r.id, width: 8 },
            { header: "ID Order", value: (r) => r.orderId, width: 10 },
            { header: "Role Pelapor", value: (r) => r.rolePelapor, width: 16 },
            { header: "Pelapor", value: (r) => r.pelaporNama, width: 22 },
            { header: "Cabang", value: (r) => r.cabangNama, width: 20 },
            { header: "Deskripsi", value: (r) => r.deskripsi, width: 48 },
            { header: "Waktu Lapor", value: (r) => xlsxDateTime(r.waktuLapor), width: 20 },
            { header: "Selesai", value: (r) => yaTidak(r.status), width: 12 },
          ],
        },
      ];
    },
  },

  rekap_harian: {
    label: "Rekap Harian & Selisih",
    filename: "rekap-harian",
    supportsFilter: true,
    filterToko: false,
    filterProduk: false,
    build: async (cabangId, filter) => {
      const [penjualan, issues] = await Promise.all([
        listPenjualan(cabangId, filter),
        listIssueAll(cabangId, filter),
      ]);
      const allOrders = penjualan.headers;

      // Sheet 1: pivot ringkasan per status
      const pivot = new Map<string, { count: number; total: number }>();
      for (const o of allOrders) {
        const g = pivot.get(o.status) ?? { count: 0, total: 0 };
        g.count++;
        g.total += o.total;
        pivot.set(o.status, g);
      }
      const summaryRows = [...pivot.entries()].map(([status, g]) => ({
        status,
        count: g.count,
        totalTagihan: g.total,
      }));

      // Sheet 2: order yang belum lunas
      const openOrders = allOrders.filter((o) => o.status !== "paid");

      return [
        {
          name: "Ringkasan Status",
          rows: summaryRows,
          columns: [
            { header: "Status", value: (r) => r.status, width: 22 },
            { header: "Jumlah Order", value: (r) => r.count, width: 14 },
            { header: "Total Tagihan", value: (r) => r.totalTagihan, width: 20, numFmt: RP },
          ],
        },
        {
          name: "Order Belum Lunas",
          rows: openOrders,
          columns: [
            { header: "ID Order", value: (r) => r.id, width: 10 },
            { header: "Tanggal", value: (r) => xlsxDateTime(r.tanggal), width: 20 },
            { header: "Toko", value: (r) => r.tokoNama, width: 28 },
            { header: "Cabang", value: (r) => r.cabangNama, width: 20 },
            { header: "Sales", value: (r) => r.salesNama, width: 22 },
            { header: "Tipe", value: (r) => r.tipe, width: 16 },
            { header: "Status", value: (r) => r.status, width: 16 },
            { header: "Jumlah Item", value: (r) => r.jumlahItem, width: 12 },
            { header: "Total", value: (r) => r.total, width: 18, numFmt: RP },
          ],
        },
        {
          name: "Kendala & Selisih",
          rows: issues,
          columns: [
            { header: "ID", value: (r) => r.id, width: 8 },
            { header: "ID Order", value: (r) => r.orderId, width: 10 },
            { header: "Role Pelapor", value: (r) => r.rolePelapor, width: 16 },
            { header: "Pelapor", value: (r) => r.pelaporNama, width: 22 },
            { header: "Cabang", value: (r) => r.cabangNama, width: 20 },
            { header: "Deskripsi", value: (r) => r.deskripsi, width: 48 },
            { header: "Waktu Lapor", value: (r) => xlsxDateTime(r.waktuLapor), width: 20 },
            { header: "Selesai", value: (r) => yaTidak(r.status), width: 12 },
          ],
        },
      ];
    },
  },
} satisfies Record<string, ReportDef>;

export type ReportEntity = keyof typeof REPORTS;

export const REPORT_ENTITIES = Object.keys(REPORTS) as ReportEntity[];

export function isReportEntity(v: string): v is ReportEntity {
  return v in REPORTS;
}

// Akses bertipe ReportDef (satisfies mempersempit ke tipe literal tiap entri).
export function getReport(entity: ReportEntity): ReportDef {
  return REPORTS[entity];
}

// Daftar entitas untuk halaman Laporan, dikelompokkan.
export const REPORT_GROUPS: { group: string; entities: ReportEntity[] }[] = [
  { group: "Master Data", entities: ["cabang", "produk", "toko", "harga", "diskon", "user"] },
  {
    group: "Transaksi",
    entities: ["penjualan", "pembayaran", "pengantaran", "mutasi", "retur", "kendala", "rekap_harian"],
  },
];

// Nama file unduhan lengkap dengan tanggal hari ini.
export function reportFilename(entity: ReportEntity): string {
  const d = new Date();
  const tgl = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${REPORTS[entity].filename}-${tgl}.xlsx`;
}

// Metadata laporan untuk UI (filter apa saja yang berlaku per entitas).
export type ReportMeta = {
  entity: ReportEntity;
  label: string;
  requiresGlobal: boolean;
  supportsFilter: boolean;
  filterToko: boolean;
  filterProduk: boolean;
};

export function reportMeta(entity: ReportEntity): ReportMeta {
  const d = getReport(entity);
  return {
    entity,
    label: d.label,
    requiresGlobal: d.requiresGlobal === true,
    supportsFilter: d.supportsFilter === true,
    filterToko: d.filterToko === true,
    filterProduk: d.filterProduk === true,
  };
}

// Grup beserta metadata tiap entitas — dipakai langsung oleh halaman Laporan.
export const REPORT_GROUPS_META: { group: string; reports: ReportMeta[] }[] =
  REPORT_GROUPS.map((g) => ({
    group: g.group,
    reports: g.entities.map(reportMeta),
  }));
