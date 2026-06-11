/*
Tujuan: Menghasilkan file Excel (.xlsx) untuk laporan master/transaksi sesuai entitas.
Caller: Tombol unduh di halaman Laporan & dashboard (anchor /export/[entity]).
Dependensi: Session guard, RBAC cabang-scoping, registry laporan, builder Excel, audit.
Main Functions: GET.
Side Effects: Membaca database, menulis audit log, dan mengirim respons .xlsx.
*/

import { requireUser } from "@/lib/session";
import { hasGlobalDataAccess, roleNameFromId } from "@/lib/roles";
import { buildWorkbook } from "@/lib/excel";
import {
  getReport,
  isReportEntity,
  reportFilename,
} from "@/server/reports";
import type { ReportFilter } from "@/server/report-queries";
import { writeAudit } from "@/server/audit";

export const runtime = "nodejs";

// Parse angka positif dari query param; null jika kosong/invalid.
function parseId(url: URL, key: string): number | null {
  const raw = url.searchParams.get(key);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Bangun filter laporan dari query params.
// Tanggal: ?from=YYYY-MM-DD&to=YYYY-MM-DD (to inklusif -> dikonversi ke batas eksklusif).
function parseFilter(url: URL, def: ReturnType<typeof getReport>): ReportFilter {
  const filter: ReportFilter = {};
  if (!def.supportsFilter) return filter;

  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");
  if (fromStr) {
    const d = new Date(`${fromStr}T00:00:00`);
    if (!Number.isNaN(d.getTime())) filter.from = d;
  }
  if (toStr) {
    const d = new Date(`${toStr}T00:00:00`);
    if (!Number.isNaN(d.getTime())) {
      d.setDate(d.getDate() + 1); // inklusif -> eksklusif
      filter.to = d;
    }
  }

  if (def.filterToko) {
    const tokoId = parseId(url, "toko");
    if (tokoId != null) filter.tokoId = tokoId;
  }
  if (def.filterProduk) {
    const produkId = parseId(url, "produk");
    if (produkId != null) filter.produkId = produkId;
  }
  return filter;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ entity: string }> },
) {
  const user = await requireUser();
  const { entity } = await params;

  if (!isReportEntity(entity)) {
    return new Response("Laporan tidak ditemukan", { status: 404 });
  }

  const def = getReport(entity);
  const global = hasGlobalDataAccess(roleNameFromId(user.roleId));

  // Laporan master (lintas-cabang) hanya untuk owner/super_admin.
  if (def.requiresGlobal && !global) {
    return new Response("Tidak berwenang", { status: 403 });
  }

  const url = new URL(req.url);

  // Penentuan cabang: peran non-global selalu dibatasi ke cabangnya sendiri.
  // Owner/super_admin default semua cabang (null), tapi bisa memilih satu via ?cabang=.
  let cabangId: number | null;
  if (global) {
    cabangId = parseId(url, "cabang");
  } else {
    cabangId = user.cabangId;
  }

  const filter = parseFilter(url, def);

  const sheets = await def.build(cabangId, filter);
  const buf = await buildWorkbook(sheets);
  const filename = reportFilename(entity);

  await writeAudit({
    userId: Number(user.id),
    action: "export",
    table: entity,
    newValue: {
      cabangId,
      filter: {
        from: filter.from?.toISOString() ?? null,
        to: filter.to?.toISOString() ?? null,
        tokoId: filter.tokoId ?? null,
        produkId: filter.produkId ?? null,
      },
      sheets: sheets.map((s) => ({ name: s.name, rows: s.rows.length })),
    },
  });

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
