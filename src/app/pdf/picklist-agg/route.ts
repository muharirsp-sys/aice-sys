/*
Tujuan: Menghasilkan PDF Pick List Gabungan dari semua nota approved yang belum di-pick-list.
        Setelah PDF dibuat, semua nota yang dimasukkan ditandai is_pick_listed = true.
Caller: Tombol "Pick List Gabungan" di halaman gudang.
Dependensi: Session guard (gudang), query, renderer PDF, audit.
Main Functions: GET.
Side Effects: Membaca database, update is_pick_listed, menulis audit log, mengirim respons PDF.
*/

import { inArray } from "drizzle-orm";
import { requireRole } from "@/lib/session";
import { listUnPickListedApproved } from "@/server/queries";
import { renderAggPickListPdf } from "@/pdf/documents";
import { writeAudit } from "@/server/audit";
import { db } from "@/db";
import { order } from "@/db/schema";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireRole("gudang");

  const orders = await listUnPickListedApproved(user.cabangId);
  if (orders.length === 0)
    return new Response(JSON.stringify({ error: "Tidak ada nota yang perlu di-pick-list." }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });

  const tanggal = new Date().toISOString().slice(0, 10);
  const cabangNama = orders[0].cabangNama;

  const buf = await renderAggPickListPdf(orders, cabangNama, tanggal);

  const orderIds = orders.map((o) => o.id);
  await Promise.all([
    db.update(order).set({ isPickListed: true }).where(inArray(order.id, orderIds)),
    writeAudit({
      userId: Number(user.id),
      action: "print",
      table: "picklist_agg",
      newValue: { orderIds, count: orderIds.length, tanggal },
    }),
  ]);

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="picklist-gabungan-${tanggal}.pdf"`,
    },
  });
}
