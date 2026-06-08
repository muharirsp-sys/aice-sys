import { requireUser } from "@/lib/session";
import { roleNameFromId } from "@/lib/roles";
import { getOrderDetail } from "@/server/queries";
import { renderKwitansiPdf } from "@/pdf/documents";
import { totalItems } from "@/lib/pricing-calc";
import { writeAudit } from "@/server/audit";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const detail = await getOrderDetail(Number(id));
  if (!detail) return new Response("Order tidak ditemukan", { status: 404 });
  const o = detail.order;
  if (roleNameFromId(user.roleId) !== "owner" && o.cabangId !== user.cabangId)
    return new Response("Tidak berwenang", { status: 403 });

  const jumlah = detail.pembayaran?.jumlah ?? totalItems(o.items);
  const metode = detail.pembayaran?.metode ?? "tunai";

  const buf = await renderKwitansiPdf(o, jumlah, metode);
  await writeAudit({ userId: Number(user.id), action: "print", table: "kwitansi", newValue: { orderId: o.id } });
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="kwitansi-${o.id}.pdf"`,
    },
  });
}
