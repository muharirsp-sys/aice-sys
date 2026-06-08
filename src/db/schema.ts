// Skema database — PERSIS mengikuti ER diagram prd.md §6.
// Dialect: SQLite (better-sqlite3). Tidak ada tabel/kolom di luar PRD.
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

import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

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
});

export const orderItem = sqliteTable("order_item", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id")
    .notNull()
    .references(() => order.id),
  produkId: integer("produk_id")
    .notNull()
    .references(() => produk.id),
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
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Verification = typeof verification.$inferSelect;
