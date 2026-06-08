// Seed: master data + user (via Better Auth) + data transaksional contoh.
// Transaksional agar dashboard/list langsung berisi & alur Order-to-Cash bisa ditelusuri.
// Idempotent. Jalankan: pnpm db:seed

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "./index";
import { auth } from "../lib/auth";
import { subtotalItem } from "../lib/pricing-calc";
import {
  cabang,
  role,
  user,
  toko,
  produk,
  hargaCabang,
  diskonToko,
  account,
  session,
  verification,
  order,
  orderItem,
  approval,
  pengiriman,
  pembayaran,
  issue,
  auditLog,
  dailyClosing,
} from "./schema";

const devPassword = "password123";

const users = [
  { nama: "Owner Pusat", email: "owner@aice.test", roleId: 6, cabangId: 1 },
  { nama: "Sales Surabaya", email: "sales.sby@aice.test", roleId: 1, cabangId: 1 },
  { nama: "Admin Surabaya", email: "admin.sby@aice.test", roleId: 2, cabangId: 1 },
  { nama: "Gudang Surabaya", email: "gudang.sby@aice.test", roleId: 3, cabangId: 1 },
  { nama: "Delivery Surabaya", email: "delivery.sby@aice.test", roleId: 4, cabangId: 1 },
  { nama: "Incaso Surabaya", email: "incaso.sby@aice.test", roleId: 5, cabangId: 1 },
  { nama: "Sales Malang", email: "sales.mlg@aice.test", roleId: 1, cabangId: 2 },
];

const basePrice: Record<number, number> = { 1: 120000, 2: 38000, 3: 65000, 4: 170000, 5: 14000 };
const cabangDelta: Record<number, number> = { 1: 0, 2: 1000, 3: 500, 4: 1500 };
const hargaOf = (produkId: number, cabangId: number) =>
  basePrice[produkId] + cabangDelta[cabangId];

const now = Date.now();
const minutesAgo = (m: number) => new Date(now - m * 60000);
const today = new Date();
const yesterday = new Date(now - 86400000);

const BUKTI_SEED = "/uploads/seed-sample.svg";

async function writePlaceholderBukti() {
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240"><rect width="320" height="240" fill="#e7e5e0"/><g fill="#a8a29e"><rect x="118" y="96" width="84" height="58" rx="8"/><circle cx="160" cy="125" r="18" fill="#e7e5e0"/></g><text x="160" y="195" font-family="sans-serif" font-size="15" fill="#78716c" text-anchor="middle">Contoh Bukti (seed)</text></svg>`;
  await writeFile(path.join(dir, "seed-sample.svg"), svg, "utf8");
}

async function main() {
  console.log("Seeding database...");
  await writePlaceholderBukti();

  // Bersihkan (anak dulu, lalu induk).
  await db.delete(auditLog);
  await db.delete(dailyClosing);
  await db.delete(orderItem);
  await db.delete(approval);
  await db.delete(pengiriman);
  await db.delete(pembayaran);
  await db.delete(issue);
  await db.delete(order);
  await db.delete(diskonToko);
  await db.delete(hargaCabang);
  await db.delete(toko);
  await db.delete(produk);
  await db.delete(account);
  await db.delete(session);
  await db.delete(verification);
  await db.delete(user);
  await db.delete(cabang);
  await db.delete(role);
  // Reset penghitung AUTOINCREMENT agar id mulai dari 1 (id demo ramah: order #1..8).
  await db.run(sql`DELETE FROM sqlite_sequence`);

  await db.insert(role).values([
    { id: 1, roleName: "sales" },
    { id: 2, roleName: "admin_fakturist" },
    { id: 3, roleName: "gudang" },
    { id: 4, roleName: "delivery" },
    { id: 5, roleName: "incaso" },
    { id: 6, roleName: "owner" },
  ]);

  await db.insert(cabang).values([
    { id: 1, nama: "Cabang Surabaya", alamat: "Jl. Raya Darmo 12, Surabaya" },
    { id: 2, nama: "Cabang Malang", alamat: "Jl. Soekarno Hatta 45, Malang" },
    { id: 3, nama: "Cabang Sidoarjo", alamat: "Jl. Ahmad Yani 8, Sidoarjo" },
    { id: 4, nama: "Cabang Gresik", alamat: "Jl. Veteran 21, Gresik" },
  ]);

  for (const u of users) {
    await auth.api.signUpEmail({
      body: {
        name: u.nama,
        email: u.email,
        password: devPassword,
        roleId: u.roleId,
        cabangId: u.cabangId,
      },
    });
  }

  await db.insert(produk).values([
    { id: 1, nama: "Indomie Goreng", sku: "IDM-GRG", satuan: "dus" },
    { id: 2, nama: "Aqua 600ml", sku: "AQ-600", satuan: "karton" },
    { id: 3, nama: "Beras Pandan Wangi 5kg", sku: "BRS-PDN5", satuan: "sak" },
    { id: 4, nama: "Minyak Goreng 1L", sku: "MGR-1L", satuan: "karton" },
    { id: 5, nama: "Gula Pasir 1kg", sku: "GLA-1KG", satuan: "sak" },
  ]);

  const hargaRows = [];
  for (let c = 1; c <= 4; c++)
    for (let p = 1; p <= 5; p++)
      hargaRows.push({ produkId: p, cabangId: c, harga: hargaOf(p, c) });
  await db.insert(hargaCabang).values(hargaRows);

  await db.insert(toko).values([
    { id: 1, nama: "Toko Makmur Jaya", alamat: "Jl. Kedungdoro 100, Surabaya", noTelp: "031-5550101", cabangId: 1 },
    { id: 2, nama: "Toko Sumber Rejeki", alamat: "Jl. Diponegoro 7, Surabaya", noTelp: "031-5550202", cabangId: 1 },
    { id: 3, nama: "Toko Barokah", alamat: "Jl. Ijen 33, Malang", noTelp: "0341-330303", cabangId: 2 },
  ]);

  await db.insert(diskonToko).values([
    { tokoId: 1, produkId: 1, diskonPersen: 5, diskonRupiah: 0, batasDiskonPersen: 10, batasDiskonRupiah: 5000 },
    { tokoId: 1, produkId: 4, diskonPersen: 0, diskonRupiah: 2000, batasDiskonPersen: 5, batasDiskonRupiah: 3000 },
  ]);

  // Map email -> user id (id auto dari Better Auth).
  const uRows = await db.select({ id: user.id, email: user.email }).from(user);
  const uid = Object.fromEntries(uRows.map((u) => [u.email, u.id])) as Record<string, number>;
  const salesSby = uid["sales.sby@aice.test"];
  const adminSby = uid["admin.sby@aice.test"];
  const gudangSby = uid["gudang.sby@aice.test"];
  const deliverySby = uid["delivery.sby@aice.test"];
  const incasoSby = uid["incaso.sby@aice.test"];
  const salesMlg = uid["sales.mlg@aice.test"];

  type Seed = {
    tokoId: number;
    userId: number;
    cabangId: number;
    status: string;
    tanggal: Date;
    items: { produkId: number; qty: number; dp?: number; dr?: number }[];
  };

  async function mkOrder(s: Seed) {
    const [o] = await db
      .insert(order)
      .values({
        tokoId: s.tokoId,
        userId: s.userId,
        cabangId: s.cabangId,
        status: s.status,
        tanggal: s.tanggal,
      })
      .returning({ id: order.id });
    let total = 0;
    const rows = s.items.map((it) => {
      const hargaSatuan = hargaOf(it.produkId, s.cabangId);
      const dp = it.dp ?? 0;
      const dr = it.dr ?? 0;
      total += subtotalItem({ qty: it.qty, hargaSatuan, diskonPersen: dp, diskonRupiah: dr });
      return {
        orderId: o.id,
        produkId: it.produkId,
        qty: it.qty,
        hargaSatuan,
        diskonPersenApplied: dp,
        diskonRupiahApplied: dr,
      };
    });
    await db.insert(orderItem).values(rows);
    return { id: o.id, total };
  }

  // Pending (cabang 1)
  const o1 = await mkOrder({ tokoId: 1, userId: salesSby, cabangId: 1, status: "pending_approval", tanggal: today, items: [{ produkId: 1, qty: 20, dp: 5 }, { produkId: 2, qty: 15 }, { produkId: 5, qty: 30 }] });
  await mkOrder({ tokoId: 2, userId: salesSby, cabangId: 1, status: "pending_approval", tanggal: today, items: [{ produkId: 4, qty: 10, dr: 2000 }, { produkId: 3, qty: 8 }] });

  // Approved (perlu dibuat siap oleh gudang)
  const o3 = await mkOrder({ tokoId: 3, userId: salesMlg, cabangId: 2, status: "approved", tanggal: today, items: [{ produkId: 1, qty: 12 }, { produkId: 5, qty: 25 }] });
  const o4 = await mkOrder({ tokoId: 1, userId: salesSby, cabangId: 1, status: "approved", tanggal: today, items: [{ produkId: 2, qty: 40 }, { produkId: 4, qty: 6 }] });

  // Ready to ship (delivery)
  const o5 = await mkOrder({ tokoId: 2, userId: salesSby, cabangId: 1, status: "ready_to_ship", tanggal: yesterday, items: [{ produkId: 3, qty: 15 }, { produkId: 5, qty: 50 }] });

  // Delivered (incaso)
  const o6 = await mkOrder({ tokoId: 1, userId: salesSby, cabangId: 1, status: "delivered", tanggal: yesterday, items: [{ produkId: 1, qty: 18 }, { produkId: 4, qty: 8 }] });

  // Paid hari ini & kemarin (untuk KPI pendapatan)
  const o7 = await mkOrder({ tokoId: 1, userId: salesSby, cabangId: 1, status: "paid", tanggal: today, items: [{ produkId: 2, qty: 25 }, { produkId: 5, qty: 40 }] });
  const o8 = await mkOrder({ tokoId: 2, userId: salesSby, cabangId: 1, status: "paid", tanggal: yesterday, items: [{ produkId: 1, qty: 10 }, { produkId: 3, qty: 12 }] });

  // Approval untuk order yang sudah lewat tahap approve
  await db.insert(approval).values(
    [o3.id, o4.id, o5.id, o6.id, o7.id, o8.id].map((orderId) => ({
      orderId,
      adminUserId: adminSby,
      approvedAt: today,
      status: "approved",
      alasanTolak: null,
    })),
  );

  // Pengiriman (delivered & paid)
  await db.insert(pengiriman).values(
    [o6.id, o7.id, o8.id].map((orderId) => ({
      orderId,
      deliveryUserId: deliverySby,
      dikirim: yesterday,
      diterima: yesterday,
      buktiTerimaUrl: BUKTI_SEED,
      gpsCoord: "-7.2575, 112.7521",
    })),
  );

  // Pembayaran (paid) — hari ini & kemarin
  await db.insert(pembayaran).values([
    { orderId: o7.id, incasoUserId: incasoSby, tanggalBayar: today, jumlah: o7.total, metode: "transfer", buktiBayarUrl: BUKTI_SEED },
    { orderId: o8.id, incasoUserId: incasoSby, tanggalBayar: yesterday, jumlah: o8.total, metode: "tunai", buktiBayarUrl: BUKTI_SEED },
  ]);

  // Issues (belum tertangani) -> tampil di dashboard owner
  await db.insert(issue).values([
    { orderId: o1.id, pelaporUserId: gudangSby, rolePelapor: "gudang", deskripsi: "Stok Indomie Goreng kurang 12 dus saat persiapan.", waktuLapor: minutesAgo(8), status: false },
    { orderId: o6.id, pelaporUserId: incasoSby, rolePelapor: "incaso", deskripsi: "Pembayaran kurang Rp150.000 dari nilai faktur.", waktuLapor: minutesAgo(23), status: false },
  ]);

  // Audit trail historis (agar halaman /audit langsung berisi).
  await db.insert(auditLog).values([
    { userId: salesSby, action: "create_order", tableAffected: "order", newValue: JSON.stringify({ orderId: o7.id, total: o7.total }), timestamp: minutesAgo(190) },
    { userId: adminSby, action: "approve_order", tableAffected: "order", newValue: JSON.stringify({ orderId: o7.id, status: "approved" }), timestamp: minutesAgo(165) },
    { userId: deliverySby, action: "mark_delivered", tableAffected: "pengiriman", newValue: JSON.stringify({ orderId: o7.id, gps: "-7.2575, 112.7521" }), timestamp: minutesAgo(120) },
    { userId: incasoSby, action: "record_payment", tableAffected: "pembayaran", newValue: JSON.stringify({ orderId: o7.id, jumlah: o7.total, metode: "transfer" }), timestamp: minutesAgo(95) },
    { userId: gudangSby, action: "report_shortage", tableAffected: "issue", newValue: JSON.stringify({ orderId: o1.id }), timestamp: minutesAgo(8) },
  ]);

  // Riwayat audit tambahan (mendemonstrasikan tabel virtualisasi yang panjang).
  const histActions = [
    { a: "create_order", t: "order", u: salesSby },
    { a: "approve_order", t: "order", u: adminSby },
    { a: "confirm_ready", t: "order", u: gudangSby },
    { a: "mark_delivered", t: "pengiriman", u: deliverySby },
    { a: "record_payment", t: "pembayaran", u: incasoSby },
    { a: "print", t: "faktur", u: adminSby },
  ];
  const bulk = [];
  for (let i = 0; i < 60; i++) {
    const h = histActions[i % histActions.length];
    bulk.push({
      userId: h.u,
      action: h.a,
      tableAffected: h.t,
      newValue: JSON.stringify({ orderId: (i % 8) + 1 }),
      timestamp: minutesAgo(240 + i * 13),
    });
  }
  await db.insert(auditLog).values(bulk);

  const counts = {
    role: (await db.select().from(role)).length,
    cabang: (await db.select().from(cabang)).length,
    user: (await db.select().from(user)).length,
    produk: (await db.select().from(produk)).length,
    toko: (await db.select().from(toko)).length,
    order: (await db.select().from(order)).length,
    orderItem: (await db.select().from(orderItem)).length,
    pembayaran: (await db.select().from(pembayaran)).length,
    issue: (await db.select().from(issue)).length,
  };
  console.log("Seed complete:", counts);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
