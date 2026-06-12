/*
Tujuan: Menghasilkan PDF faktur untuk order yang dapat diakses user.
Caller: Tombol cetak faktur pada modul Admin dan detail order.
Dependensi: Session guard, RBAC global, query order, renderer PDF, dan audit.
Main Functions: GET.
Side Effects: Membaca database, menulis audit log, dan mengirim respons PDF.
*/

import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";
import { hasGlobalDataAccess, roleNameFromId } from "@/lib/roles";
import { getOrderView } from "@/server/queries";
import { renderFakturPdf } from "@/pdf/documents";
import { writeAudit } from "@/server/audit";
import { db } from "@/db";
import { order } from "@/db/schema";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const o = await getOrderView(Number(id));
  if (!o) return new Response("Order tidak ditemukan", { status: 404 });
  if (!hasGlobalDataAccess(roleNameFromId(user.roleId)) && o.cabangId !== user.cabangId)
    return new Response("Tidak berwenang", { status: 403 });

  const buf = await renderFakturPdf(o);
  const ops: Promise<unknown>[] = [
    writeAudit({ userId: Number(user.id), action: "print", table: "faktur", newValue: { orderId: o.id } }),
  ];
  // Tandai tercetak untuk approved dan ready_to_ship — supaya hilang dari panel Cetak Massal.
  if (o.status === "approved" || o.status === "ready_to_ship") {
    ops.push(db.update(order).set({ isPrinted: true }).where(eq(order.id, o.id)));
  }
  await Promise.all(ops);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="faktur-${o.id}.pdf"`,
    },
  });
}
