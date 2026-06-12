"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { tandaTerima, tandaTerimaItem, order, issue } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { canAccessRole, roleNameFromId } from "@/lib/roles";
import { saveUpload } from "./upload";
import { writeAudit } from "./audit";

type ActionResult = { ok: true; id?: number } | { ok: false; error: string };

async function requireActor(
  roleName: "admin_fakturist" | "gudang",
): Promise<{ error: string } | { user: { id: number; cabangId: number } }> {
  const u = await getCurrentUser();
  if (!u) return { error: "Sesi berakhir." } as const;
  if (!canAccessRole(roleNameFromId(u.roleId), roleName))
    return { error: "Tidak berwenang." } as const;
  return { user: { id: Number(u.id), cabangId: u.cabangId } };
}

// Admin/fakturist membuat tanda terima dari order-order approved.
export async function createTandaTerima(orderIds: number[]): Promise<ActionResult> {
  const a = await requireActor("admin_fakturist");
  if ("error" in a) return { ok: false, error: a.error };
  if (!orderIds.length) return { ok: false, error: "Pilih minimal 1 nota." };

  const rows = await db
    .select({ id: order.id, status: order.status, cabangId: order.cabangId })
    .from(order)
    .where(and(inArray(order.id, orderIds), eq(order.cabangId, a.user.cabangId)));

  if (rows.length !== orderIds.length)
    return { ok: false, error: "Beberapa nota tidak valid atau di luar cabang Anda." };
  if (rows.some((o) => o.status !== "approved"))
    return { ok: false, error: "Hanya nota berstatus Approved yang bisa dimasukkan." };

  const [tt] = await db
    .insert(tandaTerima)
    .values({
      cabangId: a.user.cabangId,
      adminUserId: a.user.id,
      tanggal: new Date(),
      status: "pending",
    })
    .returning({ id: tandaTerima.id });

  await db.insert(tandaTerimaItem).values(
    orderIds.map((orderId) => ({ tandaTerimaId: tt.id, orderId, status: "pending" })),
  );

  await writeAudit({
    userId: a.user.id,
    action: "create_tanda_terima",
    table: "tanda_terima",
    newValue: { id: tt.id, orderCount: orderIds.length },
  });

  revalidatePath("/admin");
  revalidatePath("/gudang");
  return { ok: true, id: tt.id };
}

// Gudang mengkonfirmasi penerimaan: tandai sesuai/tidak per nota + upload bukti.
export async function konfirmasiTandaTerima(formData: FormData): Promise<ActionResult> {
  const a = await requireActor("gudang");
  if ("error" in a) return { ok: false, error: a.error };

  const ttId = Number(formData.get("tandaTerimaId"));
  const itemsJson = String(formData.get("items") ?? "[]");
  const file = formData.get("bukti");

  let items: { orderId: number; status: "sesuai" | "tidak_sesuai"; catatan?: string }[];
  try {
    items = JSON.parse(itemsJson);
  } catch {
    return { ok: false, error: "Data konfirmasi tidak valid." };
  }

  const [tt] = await db
    .select({ id: tandaTerima.id, status: tandaTerima.status, cabangId: tandaTerima.cabangId })
    .from(tandaTerima)
    .where(eq(tandaTerima.id, ttId))
    .limit(1);

  if (!tt) return { ok: false, error: "Tanda terima tidak ditemukan." };
  if (tt.cabangId !== a.user.cabangId) return { ok: false, error: "Tanda terima di luar cabang Anda." };
  if (tt.status === "dikonfirmasi") return { ok: false, error: "Tanda terima sudah dikonfirmasi." };

  let buktiUrl: string | null = null;
  if (file instanceof File && file.size > 0) {
    try {
      buktiUrl = await saveUpload(file, `tt-${ttId}`);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Gagal unggah bukti." };
    }
  }

  for (const item of items) {
    await db
      .update(tandaTerimaItem)
      .set({ status: item.status, catatan: item.catatan ?? null })
      .where(
        and(eq(tandaTerimaItem.tandaTerimaId, ttId), eq(tandaTerimaItem.orderId, item.orderId)),
      );
  }

  await db
    .update(tandaTerima)
    .set({ status: "dikonfirmasi", buktiUrl, gudangUserId: a.user.id, dikonfirmasiAt: new Date() })
    .where(eq(tandaTerima.id, ttId));

  // Nota sesuai → langsung ready_to_ship
  const sesuaiIds = items.filter((i) => i.status === "sesuai").map((i) => i.orderId);
  if (sesuaiIds.length > 0) {
    await db.update(order).set({ status: "ready_to_ship" }).where(inArray(order.id, sesuaiIds));
  }

  // Nota tidak sesuai → buat issue supaya admin & owner tahu
  const tidakSesuaiItems = items.filter((i) => i.status === "tidak_sesuai");
  const now = new Date();
  for (const item of tidakSesuaiItems) {
    const catatan = item.catatan ? ` — ${item.catatan}` : "";
    await db.insert(issue).values({
      orderId: item.orderId,
      pelaporUserId: a.user.id,
      rolePelapor: "gudang",
      deskripsi: `Tidak sesuai pada TT-${String(ttId).padStart(5, "0")}${catatan}`,
      waktuLapor: now,
      status: false,
    });
  }

  const tidakSesuai = tidakSesuaiItems.length;
  await writeAudit({
    userId: a.user.id,
    action: "konfirmasi_tanda_terima",
    table: "tanda_terima",
    newValue: { id: ttId, tidakSesuai },
  });

  revalidatePath("/gudang");
  revalidatePath("/admin");
  return { ok: true };
}
