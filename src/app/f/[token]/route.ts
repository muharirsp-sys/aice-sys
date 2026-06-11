/*
Tujuan: Menyajikan PDF faktur kanvas via token publik (link dikirim ke WA toko).
Caller: Link dalam pesan WhatsApp — diakses toko tanpa login.
Dependensi: Query shareToken, query order, renderer PDF, dan audit.
Main Functions: GET.
Side Effects: Membaca database, menulis audit log, dan mengirim respons PDF.
*/

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { order } from "@/db/schema";
import { getOrderByShareToken } from "@/server/kanvas-queries";
import { renderFakturPdf } from "@/pdf/documents";
import { writeAudit } from "@/server/audit";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const o = await getOrderByShareToken(token);
  if (!o) return new Response("Faktur tidak ditemukan", { status: 404 });

  const buf = await renderFakturPdf(o);

  // Akses publik diaudit atas nama sales pembuat faktur (tidak ada sesi login).
  const [row] = await db
    .select({ userId: order.userId })
    .from(order)
    .where(eq(order.id, o.id))
    .limit(1);
  await writeAudit({
    userId: row!.userId,
    action: "faktur_public_view",
    table: "faktur",
    newValue: { orderId: o.id },
  });

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="faktur-${o.id}.pdf"`,
    },
  });
}
