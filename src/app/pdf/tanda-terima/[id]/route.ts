import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { canAccessRole, roleNameFromId } from "@/lib/roles";
import {
  listTandaTerimaForAdmin,
  getTandaTerimaItems,
  listOrdersByIds,
  namaCabang,
} from "@/server/queries";
import { renderTandaTerimaPdf } from "@/pdf/documents";
import { writeAudit } from "@/server/audit";
import { db } from "@/db";
import { tandaTerima } from "@/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = roleNameFromId(user.roleId);
  if (!canAccessRole(role, "admin_fakturist") && !canAccessRole(role, "gudang")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const ttId = Number(id);

  const [tt] = await db
    .select({
      id: tandaTerima.id,
      cabangId: tandaTerima.cabangId,
      tanggal: tandaTerima.tanggal,
      adminUserId: tandaTerima.adminUserId,
    })
    .from(tandaTerima)
    .where(eq(tandaTerima.id, ttId))
    .limit(1);

  if (!tt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Fetch admin nama from the recent list (reuse existing query) — or query user directly
  const adminRows = await listTandaTerimaForAdmin(tt.cabangId);
  const meta = adminRows.find((r) => r.id === ttId);
  const adminNama = meta?.adminNama ?? "—";
  const cabang = await namaCabang(tt.cabangId);

  const items = await getTandaTerimaItems(ttId);
  const orderIds = items.map((i) => i.orderId);
  const orders = await listOrdersByIds(orderIds);

  const buf = await renderTandaTerimaPdf(
    { id: tt.id, tanggal: tt.tanggal.toISOString(), adminNama },
    orders,
    cabang,
  );

  await writeAudit({
    userId: Number(user.id),
    action: "print",
    table: "tanda_terima",
    newValue: { id: ttId, orderCount: orders.length },
  });

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="tanda-terima-TT-${String(ttId).padStart(5, "0")}.pdf"`,
    },
  });
}
