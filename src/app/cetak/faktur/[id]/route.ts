import { type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";
import { hasGlobalDataAccess, roleNameFromId } from "@/lib/roles";
import { getOrderView } from "@/server/queries";
import { subtotalItem, totalItems } from "@/lib/pricing-calc";
import { tglPendek } from "@/lib/format";
import { writeAudit } from "@/server/audit";
import { db } from "@/db";
import { order } from "@/db/schema";

export const runtime = "nodejs";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rp(n: number): string {
  return n.toLocaleString("id-ID");
}

function diskonLabel(persen: number, rupiah: number): string {
  const parts: string[] = [];
  if (persen > 0) parts.push(`${persen}%`);
  if (rupiah > 0) parts.push(`Rp${rp(rupiah)}/u`);
  return parts.length ? parts.join("+") : "-";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await params;
  const o = await getOrderView(Number(id));
  if (!o) return new Response("Order tidak ditemukan", { status: 404 });
  if (
    !hasGlobalDataAccess(roleNameFromId(user.roleId)) &&
    o.cabangId !== user.cabangId
  ) {
    return new Response("Tidak berwenang", { status: 403 });
  }

  // ?ukuran=half (default, 9.5×5.5 in) atau ?ukuran=full (9.5×11 in)
  const ukuran = req.nextUrl.searchParams.get("ukuran") ?? "half";
  // ?autoprint=1 → window.print() otomatis saat halaman dimuat
  const autoprint = req.nextUrl.searchParams.get("autoprint") === "1";

  const pageW = "241.3mm";
  const pageH = ukuran === "full" ? "279.4mm" : "139.7mm";

  const total = totalItems(o.items);
  const serialNo = `INV-${o.id}`;
  const kanvas = o.tipe === "kanvas";
  const docLabel = kanvas ? "FAKTUR KANVAS" : "FAKTUR";

  const itemRows = o.items
    .map(
      (item, idx) => `
      <tr>
        <td class="c">${idx + 1}</td>
        <td>${esc(item.nama)}</td>
        <td class="c">${esc(item.satuan)}</td>
        <td class="r">${item.qty}</td>
        <td class="r">${rp(item.hargaSatuan)}</td>
        <td class="c">${diskonLabel(item.diskonPersen, item.diskonRupiah)}</td>
        <td class="r b">${rp(subtotalItem(item))}</td>
      </tr>`,
    )
    .join("");

  const autoPrintScript = autoprint
    ? `<script>window.addEventListener("load",()=>window.print());</script>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width">
<title>${esc(docLabel)} ${esc(serialNo)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{
  font-family:"Courier New",Courier,monospace;
  font-size:10pt;
  color:#000;
  background:#ccc;
  display:flex;
  flex-direction:column;
  align-items:center;
  padding:16px;
  gap:12px;
}
.no-print{display:flex;gap:8px}
.no-print button{
  font-family:"Courier New",monospace;
  font-size:9pt;
  padding:4px 16px;
  border:2px solid #000;
  cursor:pointer;
  letter-spacing:1px;
}
.btn-cetak{background:#000;color:#fff}
.page{
  background:#fff;
  width:${pageW};
  min-height:${pageH};
  padding:8mm 10mm 6mm;
  box-shadow:0 2px 10px rgba(0,0,0,.4);
}
.hdr{border-bottom:2px solid #000;padding-bottom:3px;margin-bottom:5px}
.co-name{font-size:12pt;font-weight:bold;letter-spacing:.5px}
.co-sub{font-size:7.5pt}
.doc-title{
  text-align:center;
  font-size:12pt;
  font-weight:bold;
  letter-spacing:3px;
  text-decoration:underline;
  margin:4px 0 2px;
}
.doc-no{text-align:right;font-size:8.5pt;margin-bottom:4px}
.info{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:1px 12px;
  border:1px solid #000;
  padding:3px 5px;
  margin-bottom:5px;
  font-size:8pt;
}
.irow{display:flex;gap:3px}
.ilabel{min-width:52px}
table{width:100%;border-collapse:collapse;font-size:8pt;margin-bottom:3px}
th,td{border:1px solid #000;padding:2px 3px;vertical-align:top}
th{font-weight:bold;text-align:center}
td.r{text-align:right}
td.c{text-align:center}
td.b{font-weight:bold}
.total{
  text-align:right;
  font-size:10pt;
  font-weight:bold;
  border:2px solid #000;
  padding:3px 5px;
  margin-bottom:8px;
}
.signs{display:flex;justify-content:space-between;margin-top:10px;font-size:8pt}
.sbox{width:45%;text-align:center}
.sline{border-top:1px solid #000;margin-top:22px;padding-top:2px}
.footnote{font-size:7pt;text-align:center;margin-top:6px;border-top:1px dotted #000;padding-top:3px}

@media print{
  html,body{background:none;display:block;padding:0;margin:0}
  .page{box-shadow:none;width:100%;padding:4mm 8mm 4mm;min-height:unset}
  .no-print{display:none}
}
@page{size:${pageW} ${pageH};margin:0}
</style>
${autoPrintScript}
</head>
<body>
<div class="no-print">
  <button class="btn-cetak" onclick="window.print()">[ CETAK ]</button>
  <button onclick="window.close()">Tutup</button>
</div>
<div class="page">
  <div class="hdr">
    <div class="co-name">AICE DISTRIBUTOR FMCG</div>
    <div class="co-sub">Jl. Raya Darmo 12, Surabaya &middot; Jawa Timur</div>
  </div>
  <div class="doc-title">${esc(docLabel)}</div>
  <div class="doc-no">No: <strong>${esc(serialNo)}</strong></div>
  <div class="info">
    <div class="irow"><span class="ilabel">Toko</span><span>: ${esc(o.tokoNama)}</span></div>
    <div class="irow"><span class="ilabel">Tanggal</span><span>: ${tglPendek(o.tanggal)}</span></div>
    <div class="irow"><span class="ilabel">Cabang</span><span>: ${esc(o.cabangNama)}</span></div>
    <div class="irow"><span class="ilabel">Sales</span><span>: ${esc(o.salesNama)}</span></div>
    <div class="irow"><span class="ilabel">Alamat</span><span>: ${esc(o.tokoAlamat)}</span></div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:22px">No</th>
        <th>Produk</th>
        <th style="width:50px">Satuan</th>
        <th style="width:28px">Qty</th>
        <th style="width:68px">Harga</th>
        <th style="width:52px">Diskon</th>
        <th style="width:72px">Subtotal</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>
  <div class="total">TOTAL: Rp ${rp(total)}</div>
  <div class="signs">
    <div class="sbox">
      <div class="sline">${kanvas ? "Hormat kami (Sales Kanvas)" : "Hormat kami (Fakturist)"}</div>
    </div>
    <div class="sbox">
      <div class="sline">Penerima (Toko)</div>
    </div>
  </div>
  <div class="footnote">Dicetak otomatis oleh Konsol Aice &mdash; sah tanpa tanda tangan basah.</div>
</div>
</body>
</html>`;

  const ops: Promise<unknown>[] = [
    writeAudit({
      userId: Number(user.id),
      action: "print",
      table: "faktur",
      newValue: { orderId: o.id, format: "dotmatrix", ukuran },
    }),
  ];
  if (o.status === "approved" || o.status === "ready_to_ship") {
    ops.push(db.update(order).set({ isPrinted: true }).where(eq(order.id, o.id)));
  }
  await Promise.all(ops);

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
