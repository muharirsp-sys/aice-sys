"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { kendalaItem, orderItem, order } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { canAccessRole, roleNameFromId } from "@/lib/roles";
import { writeAudit } from "./audit";

type ActionResult = { ok: true } | { ok: false; error: string };

async function requireActor(
  roleName: "gudang" | "delivery" | "owner",
): Promise<{ error: string } | { user: { id: number; cabangId: number } }> {
  const u = await getCurrentUser();
  if (!u) return { error: "Sesi berakhir." };
  if (!canAccessRole(roleNameFromId(u.roleId), roleName))
    return { error: "Tidak berwenang." };
  return { user: { id: Number(u.id), cabangId: u.cabangId } };
}

// ── Gudang: laporkan item yang stoknya kurang ────────────────────────────────
// items: [{orderItemId, qtyLapor, catatan?}]
export async function laporKendalaItems(
  orderId: number,
  items: { orderItemId: number; qtyLapor: number; catatan?: string }[],
): Promise<ActionResult> {
  const a = await requireActor("gudang");
  if ("error" in a) return { ok: false, error: a.error };
  if (!items.length) return { ok: false, error: "Minimal 1 item." };

  const [o] = await db
    .select({ id: order.id, status: order.status, cabangId: order.cabangId })
    .from(order)
    .where(eq(order.id, orderId))
    .limit(1);

  if (!o) return { ok: false, error: "Order tidak ditemukan." };
  if (o.cabangId !== a.user.cabangId) return { ok: false, error: "Order di luar cabang Anda." };
  if (o.status !== "approved") return { ok: false, error: "Hanya order Approved yang bisa dilaporkan." };

  const orderItems = await db
    .select({ id: orderItem.id, qty: orderItem.qty })
    .from(orderItem)
    .where(inArray(orderItem.id, items.map((i) => i.orderItemId)));

  const qtyMap = new Map(orderItems.map((oi) => [oi.id, oi.qty]));

  for (const item of items) {
    const qtyOrder = qtyMap.get(item.orderItemId);
    if (qtyOrder == null) return { ok: false, error: `Item ${item.orderItemId} tidak ditemukan.` };
    if (item.qtyLapor < 0 || item.qtyLapor >= qtyOrder)
      return { ok: false, error: `qtyLapor harus lebih kecil dari qty order (${qtyOrder}).` };
  }

  await db.insert(kendalaItem).values(
    items.map((item) => ({
      orderId,
      orderItemId: item.orderItemId,
      cabangId: a.user.cabangId,
      qtyOrder: qtyMap.get(item.orderItemId)!,
      qtyLapor: item.qtyLapor,
      catatanGudang: item.catatan ?? null,
      gudangUserId: a.user.id,
      status: "dilaporkan",
      createdAt: new Date(),
    })),
  );

  await writeAudit({
    userId: a.user.id,
    action: "lapor_kendala",
    table: "kendala_item",
    newValue: { orderId, itemCount: items.length },
  });

  revalidatePath("/gudang");
  revalidatePath("/delivery");
  revalidatePath("/owner");
  return { ok: true };
}

// ── Driver: sesuaikan qty yang benar-benar diterima toko ─────────────────────
// adjustments: [{kendalaItemId, qtyDriver, catatan?}]
export async function adjustKendalaDriver(
  adjustments: { kendalaItemId: number; qtyDriver: number; catatan?: string }[],
): Promise<ActionResult> {
  const a = await requireActor("delivery");
  if ("error" in a) return { ok: false, error: a.error };
  if (!adjustments.length) return { ok: false, error: "Minimal 1 item." };

  const ids = adjustments.map((x) => x.kendalaItemId);
  const rows = await db
    .select({ id: kendalaItem.id, status: kendalaItem.status, cabangId: kendalaItem.cabangId })
    .from(kendalaItem)
    .where(inArray(kendalaItem.id, ids));

  if (rows.length !== ids.length) return { ok: false, error: "Sebagian item kendala tidak ditemukan." };
  if (rows.some((r) => r.cabangId !== a.user.cabangId))
    return { ok: false, error: "Item di luar cabang Anda." };
  if (rows.some((r) => r.status !== "dilaporkan"))
    return { ok: false, error: "Hanya item berstatus 'dilaporkan' yang bisa disesuaikan." };

  for (const adj of adjustments) {
    await db
      .update(kendalaItem)
      .set({
        qtyDriver: adj.qtyDriver,
        catatanDriver: adj.catatan ?? null,
        driverUserId: a.user.id,
        status: "disesuaikan",
      })
      .where(eq(kendalaItem.id, adj.kendalaItemId));
  }

  await writeAudit({
    userId: a.user.id,
    action: "adjust_kendala",
    table: "kendala_item",
    newValue: { count: adjustments.length },
  });

  revalidatePath("/delivery");
  revalidatePath("/owner");
  return { ok: true };
}

// ── Owner: setujui/tolak kendala → update order_item.qty ─────────────────────
export async function approveKendala(itemIds: number[]): Promise<ActionResult> {
  const a = await requireActor("owner");
  if ("error" in a) return { ok: false, error: a.error };
  if (!itemIds.length) return { ok: false, error: "Minimal 1 item." };

  const rows = await db
    .select({
      id: kendalaItem.id,
      orderItemId: kendalaItem.orderItemId,
      qtyLapor: kendalaItem.qtyLapor,
      qtyDriver: kendalaItem.qtyDriver,
      status: kendalaItem.status,
      cabangId: kendalaItem.cabangId,
    })
    .from(kendalaItem)
    .where(inArray(kendalaItem.id, itemIds));

  if (rows.length !== itemIds.length) return { ok: false, error: "Sebagian item tidak ditemukan." };
  if (rows.some((r) => !["dilaporkan", "disesuaikan"].includes(r.status)))
    return { ok: false, error: "Item sudah diproses sebelumnya." };

  for (const row of rows) {
    const qtyFinal = row.qtyDriver ?? row.qtyLapor;
    await db
      .update(orderItem)
      .set({ qty: qtyFinal })
      .where(eq(orderItem.id, row.orderItemId));

    await db
      .update(kendalaItem)
      .set({ status: "disetujui", ownerUserId: a.user.id })
      .where(eq(kendalaItem.id, row.id));
  }

  await writeAudit({
    userId: a.user.id,
    action: "approve_kendala",
    table: "kendala_item",
    newValue: { count: rows.length },
  });

  revalidatePath("/owner");
  revalidatePath("/gudang");
  revalidatePath("/delivery");
  return { ok: true };
}

export async function tolakKendala(itemId: number, catatan: string): Promise<ActionResult> {
  const a = await requireActor("owner");
  if ("error" in a) return { ok: false, error: a.error };

  const [row] = await db
    .select({ id: kendalaItem.id, status: kendalaItem.status })
    .from(kendalaItem)
    .where(eq(kendalaItem.id, itemId))
    .limit(1);

  if (!row) return { ok: false, error: "Item tidak ditemukan." };
  if (!["dilaporkan", "disesuaikan"].includes(row.status))
    return { ok: false, error: "Item sudah diproses." };

  await db
    .update(kendalaItem)
    .set({ status: "ditolak", catatanOwner: catatan || null, ownerUserId: a.user.id })
    .where(eq(kendalaItem.id, itemId));

  await writeAudit({
    userId: a.user.id,
    action: "tolak_kendala",
    table: "kendala_item",
    newValue: { id: itemId, catatan },
  });

  revalidatePath("/owner");
  return { ok: true };
}
