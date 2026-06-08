import { requireUser } from "@/lib/session";
import { roleNameFromId } from "@/lib/roles";
import { getOrderView } from "@/server/queries";
import { renderFakturPdf } from "@/pdf/documents";
import { writeAudit } from "@/server/audit";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const o = await getOrderView(Number(id));
  if (!o) return new Response("Order tidak ditemukan", { status: 404 });
  if (roleNameFromId(user.roleId) !== "owner" && o.cabangId !== user.cabangId)
    return new Response("Tidak berwenang", { status: 403 });

  const buf = await renderFakturPdf(o);
  await writeAudit({ userId: Number(user.id), action: "print", table: "faktur", newValue: { orderId: o.id } });
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="faktur-${o.id}.pdf"`,
    },
  });
}
