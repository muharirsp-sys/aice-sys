import { requireUser } from "@/lib/session";
import { listOrdersByStatus, namaCabang, dateKey } from "@/server/queries";
import { renderRekapPdf } from "@/pdf/documents";
import { writeAudit } from "@/server/audit";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  const orders = await listOrdersByStatus(["approved", "ready_to_ship"], user.cabangId);
  const cabang = await namaCabang(user.cabangId);
  const tanggal = dateKey(new Date());

  const buf = await renderRekapPdf(orders, cabang, tanggal);
  await writeAudit({ userId: Number(user.id), action: "print", table: "rekap", newValue: { cabangId: user.cabangId, jumlah: orders.length } });
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="rekap-${tanggal}.pdf"`,
    },
  });
}
