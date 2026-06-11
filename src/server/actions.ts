/*
Tujuan: Menangani mutasi alur order-to-cash dan daily closing secara terotorisasi.
Caller: Komponen Sales, Admin, Gudang, Delivery, Incaso, dan Closing.
Dependensi: Drizzle DB, sesi, RBAC, pricing, upload, audit, dan revalidation Next.
Main Functions: createOrder, approveOrder, rejectOrder, confirmReady, markDelivered, recordPayment, markClosing, lockDate.
Side Effects: Read/write database, file upload, audit log, dan revalidasi halaman.
*/

"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  order,
  orderItem,
  approval,
  pengiriman,
  pembayaran,
  issue,
  toko,
  dailyClosing,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import {
  canAccessRole,
  roleNameFromId,
  ROLE_LABEL,
  type RoleName,
} from "@/lib/roles";
import { priceOrderLines, type LineInput } from "./pricing";
import { saveUpload } from "./upload";
import { writeAudit } from "./audit";
import { isDateLocked, isYesterdayLocked, dateKey, DIVISI_ORDER, getClosingBlockers } from "./queries";

export type ActionResult =
  | { ok: true; orderId?: number }
  | { ok: false; error: string };

type Actor = { id: number; cabangId: number; name: string };

// Validasi sesi + peran; super admin dapat bertindak pada seluruh modul.
async function actorWithRole(
  role: RoleName,
): Promise<{ user: Actor } | { error: string }> {
  const u = await getCurrentUser();
  if (!u) return { error: "Sesi berakhir. Silakan login ulang." };
  if (!canAccessRole(roleNameFromId(u.roleId), role)) return { error: "Tidak berwenang." };
  return { user: { id: Number(u.id), cabangId: u.cabangId, name: u.name } };
}

// Ambil order milik cabang aktor. Anotasi return eksplisit agar `"error" in r`
// mendiskriminasi union dengan benar.
async function loadOrder(
  orderId: number,
  cabangId: number,
): Promise<
  | { error: string }
  | { order: { id: number; status: string; cabangId: number; tanggal: Date } }
> {
  const [o] = await db
    .select({ id: order.id, status: order.status, cabangId: order.cabangId, tanggal: order.tanggal })
    .from(order)
    .where(eq(order.id, orderId))
    .limit(1);
  if (!o) return { error: "Order tidak ditemukan." as const };
  if (o.cabangId !== cabangId) return { error: "Order di luar cabang Anda." as const };
  // Immutable: tolak mutasi bila tanggal order sudah dikunci.
  if (await isDateLocked(o.cabangId, o.tanggal))
    return { error: "Tanggal terkunci — data tidak dapat diubah." as const };
  return { order: o };
}

// ── Sales: buat order (TANPA bukti) ──────────────────────────────────────────
export async function createOrder(input: {
  tokoId: number;
  items: (LineInput & { satuanId: number })[];
}): Promise<ActionResult> {
  const a = await actorWithRole("sales");
  if ("error" in a) return { ok: false, error: a.error };

  const [t] = await db
    .select({ id: toko.id, cabangId: toko.cabangId })
    .from(toko)
    .where(eq(toko.id, input.tokoId))
    .limit(1);
  if (!t || t.cabangId !== a.user.cabangId) {
    return { ok: false, error: "Toko tidak valid untuk cabang Anda." };
  }

  // Immutable: tidak boleh membuat order pada tanggal yang sudah dikunci.
  if (await isDateLocked(a.user.cabangId, new Date())) {
    return { ok: false, error: "Tanggal hari ini sudah dikunci — tidak bisa input order." };
  }
  // H-1 freeze: blokir jika kemarin ada record closing tapi belum dikunci.
  if (!(await isYesterdayLocked(a.user.cabangId))) {
    return { ok: false, error: "Tanggal kemarin belum dikunci. Minta Owner tutup dulu." };
  }

  // Harga otomatis + validasi batas diskon (anti-fraud, server-side).
  const priced = await priceOrderLines(a.user.cabangId, input.tokoId, input.items);
  if (!priced.ok) return { ok: false, error: priced.error };

  const [created] = await db
    .insert(order)
    .values({
      tokoId: input.tokoId,
      userId: a.user.id,
      tanggal: new Date(),
      status: "pending_approval",
      cabangId: a.user.cabangId,
    })
    .returning({ id: order.id });

  await db.insert(orderItem).values(
    priced.lines.map((l, i) => ({
      orderId: created.id,
      produkId: l.produkId,
      satuanId: input.items[i].satuanId || null,
      qty: l.qty,
      hargaSatuan: l.hargaSatuan,
      diskonPersenApplied: l.diskonPersen,
      diskonRupiahApplied: l.diskonRupiah,
    })),
  );

  await writeAudit({
    userId: a.user.id,
    action: "create_order",
    table: "order",
    newValue: { orderId: created.id, total: priced.total },
  });

  revalidatePath("/sales");
  revalidatePath("/admin");
  revalidatePath("/owner");
  return { ok: true, orderId: created.id };
}

// ── Admin Fakturist: approve / tolak ─────────────────────────────────────────
export async function approveOrder(orderId: number): Promise<ActionResult> {
  const a = await actorWithRole("admin_fakturist");
  if ("error" in a) return { ok: false, error: a.error };
  const r = await loadOrder(orderId, a.user.cabangId);
  if ("error" in r) return { ok: false, error: r.error };
  if (r.order.status === "approved")
    return { ok: false, error: "Order sudah disetujui — tidak bisa disetujui ulang." };
  if (r.order.status === "rejected")
    return { ok: false, error: "Order ditolak dan terkunci. Minta Owner untuk mereset ke Pending." };
  if (r.order.status !== "pending_approval")
    return { ok: false, error: "Order tidak dalam status Pending — tidak bisa disetujui." };

  await db.update(order).set({ status: "approved" }).where(eq(order.id, orderId));
  await db.insert(approval).values({
    orderId,
    adminUserId: a.user.id,
    approvedAt: new Date(),
    status: "approved",
    alasanTolak: null,
  });
  await writeAudit({
    userId: a.user.id,
    action: "approve_order",
    table: "order",
    oldValue: { status: "pending_approval" },
    newValue: { status: "approved" },
  });

  revalidatePath("/admin");
  revalidatePath("/gudang");
  revalidatePath("/owner");
  return { ok: true };
}

export async function rejectOrder(
  orderId: number,
  alasan: string,
): Promise<ActionResult> {
  const a = await actorWithRole("admin_fakturist");
  if ("error" in a) return { ok: false, error: a.error };
  if (!alasan.trim()) return { ok: false, error: "Alasan penolakan wajib diisi." };
  const r = await loadOrder(orderId, a.user.cabangId);
  if ("error" in r) return { ok: false, error: r.error };
  if (r.order.status !== "pending_approval")
    return { ok: false, error: "Order bukan status pending." };

  await db.update(order).set({ status: "rejected" }).where(eq(order.id, orderId));
  await db.insert(approval).values({
    orderId,
    adminUserId: a.user.id,
    approvedAt: new Date(),
    status: "rejected",
    alasanTolak: alasan.trim(),
  });
  await writeAudit({
    userId: a.user.id,
    action: "reject_order",
    table: "order",
    newValue: { status: "rejected", alasan },
  });

  revalidatePath("/admin");
  revalidatePath("/owner");
  return { ok: true };
}

// ── Gudang: konfirmasi siap + laporkan kendala ───────────────────────────────
export async function confirmReady(orderId: number): Promise<ActionResult> {
  const a = await actorWithRole("gudang");
  if ("error" in a) return { ok: false, error: a.error };
  const r = await loadOrder(orderId, a.user.cabangId);
  if ("error" in r) return { ok: false, error: r.error };
  if (r.order.status !== "approved")
    return { ok: false, error: "Order belum disetujui." };

  await db.update(order).set({ status: "ready_to_ship" }).where(eq(order.id, orderId));
  await writeAudit({
    userId: a.user.id,
    action: "confirm_ready",
    table: "order",
    newValue: { status: "ready_to_ship" },
  });

  revalidatePath("/gudang");
  revalidatePath("/delivery");
  revalidatePath("/owner");
  return { ok: true };
}

export async function reportShortage(
  orderId: number,
  deskripsi: string,
): Promise<ActionResult> {
  const a = await actorWithRole("gudang");
  if ("error" in a) return { ok: false, error: a.error };
  if (!deskripsi.trim()) return { ok: false, error: "Deskripsi kendala wajib diisi." };
  const r = await loadOrder(orderId, a.user.cabangId);
  if ("error" in r) return { ok: false, error: r.error };

  await db.insert(issue).values({
    orderId,
    pelaporUserId: a.user.id,
    rolePelapor: "gudang",
    deskripsi: deskripsi.trim(),
    waktuLapor: new Date(),
    status: false, // belum tertangani
  });
  await writeAudit({
    userId: a.user.id,
    action: "report_shortage",
    table: "issue",
    newValue: { orderId, deskripsi },
  });

  revalidatePath("/gudang");
  revalidatePath("/owner");
  return { ok: true };
}

// ── Delivery: kirim + bukti foto & GPS ───────────────────────────────────────
export async function markDelivered(formData: FormData): Promise<ActionResult> {
  const a = await actorWithRole("delivery");
  if ("error" in a) return { ok: false, error: a.error };

  const orderId = Number(formData.get("orderId"));
  const gps = String(formData.get("gps") ?? "").trim();
  const file = formData.get("bukti");
  if (!gps) return { ok: false, error: "Koordinat GPS wajib." };
  if (!(file instanceof File)) return { ok: false, error: "Foto bukti terima wajib." };

  const r = await loadOrder(orderId, a.user.cabangId);
  if ("error" in r) return { ok: false, error: r.error };
  if (r.order.status !== "ready_to_ship")
    return { ok: false, error: "Order belum siap kirim." };

  let url: string;
  try {
    url = await saveUpload(file, `terima-${orderId}`);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal unggah." };
  }

  await db.insert(pengiriman).values({
    orderId,
    deliveryUserId: a.user.id,
    dikirim: new Date(),
    diterima: new Date(),
    buktiTerimaUrl: url,
    gpsCoord: gps,
  });
  await db.update(order).set({ status: "delivered" }).where(eq(order.id, orderId));
  await writeAudit({
    userId: a.user.id,
    action: "mark_delivered",
    table: "pengiriman",
    newValue: { orderId, gps, bukti: url },
  });

  revalidatePath("/delivery");
  revalidatePath("/incaso");
  revalidatePath("/owner");
  return { ok: true };
}

// ── Incaso: catat pembayaran + bukti, laporkan selisih ───────────────────────
export async function recordPayment(formData: FormData): Promise<ActionResult> {
  const a = await actorWithRole("incaso");
  if ("error" in a) return { ok: false, error: a.error };

  const orderId = Number(formData.get("orderId"));
  const metode = String(formData.get("metode") ?? "tunai");
  const jumlah = Number(formData.get("jumlah"));
  const file = formData.get("bukti");
  if (!Number.isFinite(jumlah) || jumlah <= 0)
    return { ok: false, error: "Jumlah pembayaran tidak valid." };
  if (!(file instanceof File)) return { ok: false, error: "Bukti pembayaran wajib." };

  const r = await loadOrder(orderId, a.user.cabangId);
  if ("error" in r) return { ok: false, error: r.error };
  if (r.order.status !== "delivered")
    return { ok: false, error: "Order belum terkirim." };

  let url: string;
  try {
    url = await saveUpload(file, `bayar-${orderId}`);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal unggah." };
  }

  await db.insert(pembayaran).values({
    orderId,
    incasoUserId: a.user.id,
    tanggalBayar: new Date(),
    jumlah,
    metode,
    buktiBayarUrl: url,
  });
  await db.update(order).set({ status: "paid" }).where(eq(order.id, orderId));
  await writeAudit({
    userId: a.user.id,
    action: "record_payment",
    table: "pembayaran",
    newValue: { orderId, jumlah, metode },
  });

  revalidatePath("/incaso");
  revalidatePath("/owner");
  return { ok: true };
}

export async function reportSelisih(
  orderId: number,
  keterangan: string,
): Promise<ActionResult> {
  const a = await actorWithRole("incaso");
  if ("error" in a) return { ok: false, error: a.error };
  if (!keterangan.trim()) return { ok: false, error: "Keterangan selisih wajib diisi." };
  const r = await loadOrder(orderId, a.user.cabangId);
  if ("error" in r) return { ok: false, error: r.error };

  await db.insert(issue).values({
    orderId,
    pelaporUserId: a.user.id,
    rolePelapor: "incaso",
    deskripsi: keterangan.trim(),
    waktuLapor: new Date(),
    status: false,
  });
  await writeAudit({
    userId: a.user.id,
    action: "report_selisih",
    table: "issue",
    newValue: { orderId, keterangan },
  });

  revalidatePath("/incaso");
  revalidatePath("/owner");
  return { ok: true };
}

// ── Daily Closing per divisi (berurutan) ─────────────────────────────────────
export async function markClosing(): Promise<ActionResult> {
  const u = await getCurrentUser();
  if (!u) return { ok: false, error: "Sesi berakhir." };
  const role = roleNameFromId(u.roleId);
  const idx = role ? (DIVISI_ORDER as readonly string[]).indexOf(role) : -1;
  if (idx < 0) return { ok: false, error: "Peran Anda tidak melakukan closing divisi." };

  const cabangId = u.cabangId;
  const tanggal = dateKey(new Date());
  let [row] = await db
    .select()
    .from(dailyClosing)
    .where(and(eq(dailyClosing.cabangId, cabangId), eq(dailyClosing.tanggal, tanggal)))
    .limit(1);
  if (!row) {
    [row] = await db
      .insert(dailyClosing)
      .values({
        tanggal,
        cabangId,
        salesDone: false,
        adminDone: false,
        gudangDone: false,
        deliveryDone: false,
        incasoDone: false,
        isLocked: false,
      })
      .returning();
  }
  if (row.isLocked) return { ok: false, error: "Tanggal sudah dikunci." };

  const doneArr = [row.salesDone, row.adminDone, row.gudangDone, row.deliveryDone, row.incasoDone];
  if (doneArr[idx]) return { ok: false, error: "Divisi Anda sudah closing." };
  for (let j = 0; j < idx; j++)
    if (!doneArr[j])
      return { ok: false, error: `Menunggu ${ROLE_LABEL[DIVISI_ORDER[j]]} closing dulu (berurutan).` };

  // Gatekeeper: pastikan semua pekerjaan divisi ini sudah selesai.
  const blockers = await getClosingBlockers(cabangId, tanggal);
  const myBlockers = blockers[role!] ?? 0;
  if (myBlockers > 0)
    return { ok: false, error: `Masih ada ${myBlockers} order yang belum diselesaikan divisi ini.` };

  const patch =
    idx === 0 ? { salesDone: true }
    : idx === 1 ? { adminDone: true }
    : idx === 2 ? { gudangDone: true }
    : idx === 3 ? { deliveryDone: true }
    : { incasoDone: true };
  await db.update(dailyClosing).set(patch).where(eq(dailyClosing.id, row.id));
  await writeAudit({ userId: Number(u.id), action: "closing", table: "daily_closing", newValue: { role, tanggal } });

  revalidatePath("/closing");
  revalidatePath("/owner");
  return { ok: true };
}

// Owner mengunci tanggal: data jadi immutable. Hanya bila semua divisi sudah closing.
export async function lockDate(): Promise<ActionResult> {
  const a = await actorWithRole("owner");
  if ("error" in a) return { ok: false, error: a.error };
  const tanggal = dateKey(new Date());
  const [row] = await db
    .select()
    .from(dailyClosing)
    .where(and(eq(dailyClosing.cabangId, a.user.cabangId), eq(dailyClosing.tanggal, tanggal)))
    .limit(1);
  if (!row) return { ok: false, error: "Belum ada closing untuk dikunci." };
  if (row.isLocked) return { ok: false, error: "Tanggal sudah terkunci." };
  if (!(row.salesDone && row.adminDone && row.gudangDone && row.deliveryDone && row.incasoDone))
    return { ok: false, error: "Semua divisi harus closing sebelum dikunci." };

  await db.update(dailyClosing).set({ isLocked: true }).where(eq(dailyClosing.id, row.id));
  await writeAudit({ userId: a.user.id, action: "lock_date", table: "daily_closing", newValue: { tanggal } });

  revalidatePath("/closing");
  revalidatePath("/owner");
  return { ok: true };
}

// Owner mengirim teguran ke divisi yang belum closing (tercatat di audit_log).
export async function sendTeguran(targetRole: string): Promise<ActionResult> {
  const a = await actorWithRole("owner");
  if ("error" in a) return { ok: false, error: a.error };
  if (!(DIVISI_ORDER as readonly string[]).includes(targetRole))
    return { ok: false, error: "Divisi tidak valid." };
  await writeAudit({
    userId: a.user.id,
    action: "teguran",
    table: "daily_closing",
    newValue: { targetRole, tanggal: dateKey(new Date()) },
  });
  revalidatePath("/closing");
  return { ok: true };
}

// ── Approve All (batch untuk status pending_approval) ────────────────────────
export async function approveAllOrders(orderIds: number[]): Promise<ActionResult> {
  const a = await actorWithRole("admin_fakturist");
  if ("error" in a) return { ok: false, error: a.error };
  if (!orderIds.length) return { ok: false, error: "Tidak ada order untuk disetujui." };

  const rows = await db
    .select({ id: order.id, status: order.status, cabangId: order.cabangId, tanggal: order.tanggal })
    .from(order)
    .where(
      and(
        inArray(order.id, orderIds),
        eq(order.status, "pending_approval"),
        eq(order.cabangId, a.user.cabangId),
      ),
    );

  if (!rows.length) return { ok: false, error: "Tidak ada order pending di cabang Anda." };

  for (const o of rows) {
    if (await isDateLocked(o.cabangId, o.tanggal))
      return { ok: false, error: `Order #${o.id} — tanggal terkunci, tidak dapat disetujui.` };
  }

  const now = new Date();
  for (const o of rows) {
    await db.update(order).set({ status: "approved" }).where(eq(order.id, o.id));
    await db.insert(approval).values({
      orderId: o.id,
      adminUserId: a.user.id,
      approvedAt: now,
      status: "approved",
      alasanTolak: null,
    });
  }

  await writeAudit({
    userId: a.user.id,
    action: "approve_all_orders",
    table: "order",
    newValue: { orderIds: rows.map((o) => o.id), count: rows.length },
  });

  revalidatePath("/admin");
  revalidatePath("/gudang");
  revalidatePath("/owner");
  return { ok: true };
}

// ── Reset ke Pending (Owner/SuperAdmin override untuk order yang ditolak) ─────
export async function resetOrderToPending(orderId: number): Promise<ActionResult> {
  const a = await actorWithRole("owner");
  if ("error" in a) return { ok: false, error: a.error };

  const [o] = await db
    .select({ id: order.id, status: order.status, cabangId: order.cabangId })
    .from(order)
    .where(eq(order.id, orderId))
    .limit(1);

  if (!o) return { ok: false, error: "Order tidak ditemukan." };
  if (o.status !== "rejected")
    return { ok: false, error: "Hanya order berstatus Ditolak yang bisa direset." };

  await db.update(order).set({ status: "pending_approval" }).where(eq(order.id, orderId));
  await db.insert(approval).values({
    orderId,
    adminUserId: a.user.id,
    approvedAt: new Date(),
    status: "reset_to_pending",
    alasanTolak: "Direset ke Pending oleh Owner — Admin dapat memproses ulang.",
  });
  await writeAudit({
    userId: a.user.id,
    action: "reset_order_to_pending",
    table: "order",
    oldValue: { status: "rejected" },
    newValue: { status: "pending_approval", orderId },
  });

  revalidatePath("/admin");
  revalidatePath("/owner");
  revalidatePath(`/order/${orderId}`);
  return { ok: true };
}

// Catatan: aksi cetak (print) dicatat ke audit_log langsung di route handler PDF
// (src/app/pdf/*), bukan dari client.
// Catatan: jangan re-export tipe dari modul "use server" — loader server actions
// Next mengubah seluruh export menjadi referensi runtime (ReferenceError).
