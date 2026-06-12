// Skema database — mengikuti ER diagram prd.md §6, plus modul Kanvas Luar Kota
// (trip_kanvas, trip_item, dan kolom order.tipe/trip_id/share_token).
// Dialect: SQLite (better-sqlite3).
//
// Pemetaan tipe konseptual PRD -> Drizzle SQLite:
//   int      -> integer (PK: autoIncrement)
//   string   -> text
//   datetime -> integer({ mode: "timestamp" })  (epoch)
//   date     -> text  (format "YYYY-MM-DD")
//   boolean  -> integer({ mode: "boolean" })
//
// Catatan: satu-satunya tambahan di luar literal PRD adalah CONSTRAINT unik pada
// user.email dan produk.sku (bukan kolom/tabel baru) — natural key yang dibutuhkan
// untuk login & identifikasi produk.

import { sqliteTable, integer, text, uniqueIndex, check, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const cabang = sqliteTable("cabang", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nama: text("nama").notNull(),
  alamat: text("alamat").notNull(),
});

export const role = sqliteTable("role", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  roleName: text("role_name").notNull(),
});

export const user = sqliteTable("user", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nama: text("nama").notNull(),
  email: text("email").notNull().unique(),
  // ER PRD §6 punya user.password, tapi Better Auth menyimpan password asli di tabel
  // `account`. Kolom ini dipertahankan agar tetap selaras PRD, dijadikan nullable.
  password: text("password"),
  roleId: integer("role_id")
    .notNull()
    .references(() => role.id),
  cabangId: integer("cabang_id")
    .notNull()
    .references(() => cabang.id),
  // Kolom wajib Better Auth (Tahap 2) — di luar ER PRD, disetujui untuk auth.
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const toko = sqliteTable("toko", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nama: text("nama").notNull(),
  alamat: text("alamat"),
  noTelp: text("no_telp"),
  cabangId: integer("cabang_id")
    .notNull()
    .references(() => cabang.id),
});

export const produk = sqliteTable("produk", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nama: text("nama").notNull(),
  sku: text("sku").notNull().unique(),
  satuan: text("satuan").notNull(),
});

export const hargaCabang = sqliteTable("harga_cabang", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  produkId: integer("produk_id")
    .notNull()
    .references(() => produk.id),
  cabangId: integer("cabang_id")
    .notNull()
    .references(() => cabang.id),
  harga: integer("harga").notNull(),
});

export const diskonToko = sqliteTable("diskon_toko", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tokoId: integer("toko_id")
    .notNull()
    .references(() => toko.id),
  produkId: integer("produk_id")
    .notNull()
    .references(() => produk.id),
  diskonPersen: integer("diskon_persen").notNull(),
  diskonRupiah: integer("diskon_rupiah").notNull(),
  batasDiskonPersen: integer("batas_diskon_persen").notNull(),
  batasDiskonRupiah: integer("batas_diskon_rupiah").notNull(),
});

export const order = sqliteTable("order", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tokoId: integer("toko_id")
    .notNull()
    .references(() => toko.id),
  userId: integer("user_id")
    .notNull()
    .references(() => user.id),
  tanggal: integer("tanggal", { mode: "timestamp" }).notNull(),
  status: text("status").notNull(),
  cabangId: integer("cabang_id")
    .notNull()
    .references(() => cabang.id),
  // Modul Kanvas: faktur kanvas terbit langsung di toko (tanpa approval admin).
  tipe: text("tipe").notNull().default("taking_order"), // taking_order | kanvas
  tripId: integer("trip_id").references(() => tripKanvas.id),
  shareToken: text("share_token"), // token URL publik faktur (dikirim via WA)
  isPrinted: integer("is_printed", { mode: "boolean" }).notNull().default(false),
  isPickListed: integer("is_pick_listed", { mode: "boolean" }).notNull().default(false),
}, (t) => [uniqueIndex("order_share_token_idx").on(t.shareToken)]);

// ── Tanda Terima ────────────────────────────────────────────────────────────
// Admin/fakturist membuat tanda terima dari order approved, gudang konfirmasi penerimaan.

export const tandaTerima = sqliteTable("tanda_terima", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  cabangId: integer("cabang_id").notNull().references(() => cabang.id),
  adminUserId: integer("admin_user_id").notNull().references(() => user.id),
  tanggal: integer("tanggal", { mode: "timestamp" }).notNull(),
  status: text("status").notNull().default("pending"), // pending | dikonfirmasi
  buktiUrl: text("bukti_url"),
  gudangUserId: integer("gudang_user_id").references(() => user.id),
  dikonfirmasiAt: integer("dikonfirmasi_at", { mode: "timestamp" }),
});

export const tandaTerimaItem = sqliteTable("tanda_terima_item", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tandaTerimaId: integer("tanda_terima_id").notNull().references(() => tandaTerima.id),
  orderId: integer("order_id").notNull().references(() => order.id),
  status: text("status").notNull().default("pending"), // pending | sesuai | tidak_sesuai
  catatan: text("catatan"),
});

export const produkSatuan = sqliteTable("produk_satuan", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  produkId: integer("produk_id").notNull().references(() => produk.id),
  satuan: text("satuan").notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
});

export const orderItem = sqliteTable("order_item", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id")
    .notNull()
    .references(() => order.id),
  produkId: integer("produk_id")
    .notNull()
    .references(() => produk.id),
  satuanId: integer("satuan_id").references(() => produkSatuan.id),
  qty: integer("qty").notNull(),
  hargaSatuan: integer("harga_satuan").notNull(),
  diskonPersenApplied: integer("diskon_persen_applied").notNull(),
  diskonRupiahApplied: integer("diskon_rupiah_applied").notNull(),
});

export const approval = sqliteTable("approval", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id")
    .notNull()
    .references(() => order.id),
  adminUserId: integer("admin_user_id")
    .notNull()
    .references(() => user.id),
  approvedAt: integer("approved_at", { mode: "timestamp" }),
  status: text("status").notNull(),
  alasanTolak: text("alasan_tolak"),
});

export const pengiriman = sqliteTable("pengiriman", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id")
    .notNull()
    .references(() => order.id),
  deliveryUserId: integer("delivery_user_id")
    .notNull()
    .references(() => user.id),
  dikirim: integer("dikirim", { mode: "timestamp" }),
  diterima: integer("diterima", { mode: "timestamp" }),
  buktiTerimaUrl: text("bukti_terima_url"),
  gpsCoord: text("gps_coord"),
});

export const pembayaran = sqliteTable("pembayaran", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id")
    .notNull()
    .references(() => order.id),
  incasoUserId: integer("incaso_user_id")
    .notNull()
    .references(() => user.id),
  tanggalBayar: integer("tanggal_bayar", { mode: "timestamp" }).notNull(),
  jumlah: integer("jumlah").notNull(),
  metode: text("metode").notNull(),
  buktiBayarUrl: text("bukti_bayar_url"),
});

export const issue = sqliteTable("issue", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id")
    .notNull()
    .references(() => order.id),
  pelaporUserId: integer("pelapor_user_id")
    .notNull()
    .references(() => user.id),
  rolePelapor: text("role_pelapor").notNull(),
  deskripsi: text("deskripsi").notNull(),
  waktuLapor: integer("waktu_lapor", { mode: "timestamp" }).notNull(),
  status: integer("status", { mode: "boolean" }).notNull(),
});

export const dailyClosing = sqliteTable("daily_closing", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tanggal: text("tanggal").notNull(),
  cabangId: integer("cabang_id")
    .notNull()
    .references(() => cabang.id),
  salesDone: integer("sales_done", { mode: "boolean" }).notNull(),
  adminDone: integer("admin_done", { mode: "boolean" }).notNull(),
  gudangDone: integer("gudang_done", { mode: "boolean" }).notNull(),
  deliveryDone: integer("delivery_done", { mode: "boolean" }).notNull(),
  incasoDone: integer("incaso_done", { mode: "boolean" }).notNull(),
  isLocked: integer("is_locked", { mode: "boolean" }).notNull(),
});

export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => user.id),
  action: text("action").notNull(),
  tableAffected: text("table_affected").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
});

// ── Modul Kanvas Luar Kota ──────────────────────────────────────────────────
// Sales memuat barang sekali (trip multi-hari), membuat faktur langsung di toko,
// lalu gudang merekonsiliasi: qtyMuat = total terjual (order kanvas) + qtyKembali.

export const tripKanvas = sqliteTable("trip_kanvas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  salesUserId: integer("sales_user_id")
    .notNull()
    .references(() => user.id),
  cabangId: integer("cabang_id")
    .notNull()
    .references(() => cabang.id),
  tujuan: text("tujuan").notNull(),
  status: text("status").notNull(), // diajukan | berjalan | rekonsiliasi | selesai
  tanggalBerangkat: integer("tanggal_berangkat", { mode: "timestamp" }),
  tanggalKembali: integer("tanggal_kembali", { mode: "timestamp" }),
  gudangMuatUserId: integer("gudang_muat_user_id").references(() => user.id),
  gudangRekonUserId: integer("gudang_rekon_user_id").references(() => user.id),
  catatanSelisih: text("catatan_selisih"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const tripItem = sqliteTable("trip_item", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tripId: integer("trip_id")
    .notNull()
    .references(() => tripKanvas.id),
  produkId: integer("produk_id")
    .notNull()
    .references(() => produk.id),
  qtyMuat: integer("qty_muat").notNull(),
  qtyKembali: integer("qty_kembali"), // null sampai sales mengakhiri trip
});

// ── Stok & Kartu Stok ──────────────────────────────────────────────────────
// Stok ditrack per-cabang (konsisten dengan pola hargaCabang).
// stok_cabang = saldo saat ini; kartu_stok = ledger setiap mutasi.

export const stokCabang = sqliteTable("stok_cabang", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  produkId: integer("produk_id").notNull().references(() => produk.id),
  cabangId: integer("cabang_id").notNull().references(() => cabang.id),
  qty: integer("qty").notNull().default(0),
  // updatedAt nullable agar ALTER TABLE ADD COLUMN aman di DB yang sudah punya baris.
  // Semua insert/update lewat mutateStock akan selalu mengisi nilai ini.
  updatedAt: integer("updated_at", { mode: "timestamp" }),
}, (t) => [
  uniqueIndex("stok_cabang_produk_cabang_idx").on(t.produkId, t.cabangId),
  check("chk_stok_non_negative", sql`${t.qty} >= 0`),
]);

// kartu_stok = ledger mutasi stok (stock_movement).
// tipe: IN = stok masuk, OUT = stok keluar, ADJUSTMENT = koreksi/opname.
// qty = nilai absolut mutasi; qtySaldo = saldo setelah mutasi (balanceAfter).
// referenceId = no. faktur / PO / ref dokumen sumber.
export const kartuStok = sqliteTable("kartu_stok", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  produkId: integer("produk_id").notNull().references(() => produk.id),
  cabangId: integer("cabang_id").notNull().references(() => cabang.id),
  // Enum mencakup nilai lama (MASUK/KELUAR/KOREKSI) untuk backward compat baca data existing.
  // Semua insert baru wajib menggunakan IN / OUT / ADJUSTMENT / SALDO_AWAL.
  tipe: text("tipe", { enum: ["IN", "OUT", "ADJUSTMENT", "SALDO_AWAL", "MASUK", "KELUAR", "KOREKSI"] }).notNull(),
  qty: integer("qty").notNull(),           // nilai absolut mutasi
  qtySaldo: integer("qty_saldo").notNull(), // saldo setelah mutasi (balanceAfter)
  referenceId: text("reference_id"),       // no. faktur / PO / ref dokumen
  keterangan: text("keterangan"),
  refType: text("ref_type"),               // "order" | "manual" | null
  refId: integer("ref_id"),
  createdBy: integer("created_by").notNull().references(() => user.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => [
  // Index komposit untuk query kartu stok per cabang diurutkan terbaru (hot-path halaman inventory).
  index("kartu_stok_cabang_created_idx").on(t.cabangId, t.createdAt),
]);

// ── Tabel infrastruktur Better Auth (Tahap 2) ──────────────────────────────
// Property key = nama field Better Auth (camelCase); kolom SQL = snake_case.
// Verifikasi: drizzle-adapter mengakses schema[model] & schemaModel[fieldName].

export const session = sqliteTable("session", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: integer("user_id")
    .notNull()
    .references(() => user.id),
});

export const account = sqliteTable("account", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: integer("user_id")
    .notNull()
    .references(() => user.id),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const verification = sqliteTable("verification", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ── Kendala Item ─────────────────────────────────────────────────────────────
// Gudang melaporkan item yang stoknya kurang saat packing.
// Driver menyesuaikan qty yang benar-benar diterima toko.
// Owner menyetujui → order_item.qty diupdate → nota recalculates.

export const kendalaItem = sqliteTable("kendala_item", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").notNull().references(() => order.id),
  orderItemId: integer("order_item_id").notNull().references(() => orderItem.id),
  cabangId: integer("cabang_id").notNull().references(() => cabang.id),
  qtyOrder: integer("qty_order").notNull(),   // snapshot qty original
  qtyLapor: integer("qty_lapor").notNull(),   // gudang: qty yg bisa dikirim
  qtyDriver: integer("qty_driver"),           // driver: qty yg benar-benar diterima toko
  status: text("status").notNull().default("dilaporkan"), // dilaporkan | disesuaikan | disetujui | ditolak
  catatanGudang: text("catatan_gudang"),
  catatanDriver: text("catatan_driver"),
  catatanOwner: text("catatan_owner"),
  gudangUserId: integer("gudang_user_id").notNull().references(() => user.id),
  driverUserId: integer("driver_user_id").references(() => user.id),
  ownerUserId: integer("owner_user_id").references(() => user.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// Tipe inferensi (TS-level, bukan perubahan skema DB).
export type Cabang = typeof cabang.$inferSelect;
export type Role = typeof role.$inferSelect;
export type User = typeof user.$inferSelect;
export type Toko = typeof toko.$inferSelect;
export type Produk = typeof produk.$inferSelect;
export type HargaCabang = typeof hargaCabang.$inferSelect;
export type DiskonToko = typeof diskonToko.$inferSelect;
export type Order = typeof order.$inferSelect;
export type OrderItem = typeof orderItem.$inferSelect;
export type Approval = typeof approval.$inferSelect;
export type Pengiriman = typeof pengiriman.$inferSelect;
export type Pembayaran = typeof pembayaran.$inferSelect;
export type Issue = typeof issue.$inferSelect;
export type DailyClosing = typeof dailyClosing.$inferSelect;
export type AuditLog = typeof auditLog.$inferSelect;
export type TripKanvas = typeof tripKanvas.$inferSelect;
export type TripItem = typeof tripItem.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Verification = typeof verification.$inferSelect;
export type StokCabang = typeof stokCabang.$inferSelect;
export type KartuStok = typeof kartuStok.$inferSelect;
// Alias types for inventory module (maps to stokCabang / kartuStok).
export type Inventory = StokCabang;
export type StockMovement = KartuStok;
export type ProdukSatuan = typeof produkSatuan.$inferSelect;
export type TandaTerima = typeof tandaTerima.$inferSelect;
export type TandaTerimaItem = typeof tandaTerimaItem.$inferSelect;
export type KendalaItem = typeof kendalaItem.$inferSelect;
