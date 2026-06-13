"use server";

import ExcelJS from "exceljs";
import { db } from "@/db";
import { order, orderItem, toko, produk, produkSatuan, hargaCabang, diskonToko } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { canAccessRole, roleNameFromId } from "@/lib/roles";

export type UploadOrderRawRow = {
  OrderGroup?: unknown;
  NamaToko?: unknown;
  SKU?: unknown;
  Qty?: unknown;
  Satuan?: unknown;
  DiskonPersen?: unknown;
};

type InvalidRow = { rowData: UploadOrderRawRow; rowIndex: number; errorMessage: string };

export type UploadOrderResult =
  | { status: "partial_success" | "all_success"; total: number; insertedCount: number; failedCount: number; errorFileBase64: string | null }
  | { status: "all_failed"; total: number; insertedCount: 0; failedCount: number; errorFileBase64: string }
  | { status: "error"; message: string };

export async function uploadOrderAction(rawData: UploadOrderRawRow[]): Promise<UploadOrderResult> {
  const u = await getCurrentUser();
  if (!u) return { status: "error", message: "Sesi berakhir." };
  if (!canAccessRole(roleNameFromId(u.roleId), "admin"))
    return { status: "error", message: "Hanya Admin, Owner, atau Super Admin yang dapat melakukan bulk upload order." };
  if (!Array.isArray(rawData) || rawData.length === 0) return { status: "error", message: "Data kosong." };
  if (rawData.length > 5_000) return { status: "error", message: "Maksimal 5.000 baris per upload." };

  // Preload semua referensi sekali — hindari N+1
  const semuaToko   = await db.select({ id: toko.id, nama: toko.nama, cabangId: toko.cabangId }).from(toko);
  const tokoMap     = new Map(semuaToko.map((t) => [t.nama.toLowerCase().trim(), t]));

  const semuaProduk = await db.select({ id: produk.id, sku: produk.sku }).from(produk);
  const produkMap   = new Map(semuaProduk.map((p) => [p.sku.toLowerCase().trim(), p.id]));

  const semuaSatuan = await db.select({ id: produkSatuan.id, produkId: produkSatuan.produkId, satuan: produkSatuan.satuan }).from(produkSatuan);
  const satuanMap   = new Map(semuaSatuan.map((s) => [`${s.produkId}_${s.satuan.toLowerCase().trim()}`, s.id]));

  const semuaHarga  = await db.select({ produkId: hargaCabang.produkId, cabangId: hargaCabang.cabangId, harga: hargaCabang.harga }).from(hargaCabang);
  const hargaMap    = new Map(semuaHarga.map((h) => [`${h.produkId}_${h.cabangId}`, h.harga]));

  const semuaDiskon = await db.select({ tokoId: diskonToko.tokoId, produkId: diskonToko.produkId, diskonPersen: diskonToko.diskonPersen, diskonRupiah: diskonToko.diskonRupiah }).from(diskonToko);
  const diskonMap   = new Map(semuaDiskon.map((d) => [`${d.tokoId}_${d.produkId}`, d]));

  // ── Group baris ke per-order menggunakan OrderGroup ─────────────────────────
  const groupMap = new Map<number, { namaToko: string; rows: { raw: UploadOrderRawRow; rowIndex: number }[] }>();
  const invalidRows: InvalidRow[] = [];
  let lastGroup: number | null = null;
  let lastNamaToko = "";

  for (let i = 0; i < rawData.length; i++) {
    const raw = rawData[i];
    const rowIndex = i + 2;

    const groupStr = raw.OrderGroup !== undefined && raw.OrderGroup !== null && String(raw.OrderGroup).trim() !== ""
      ? String(raw.OrderGroup).trim() : null;
    const groupNum = groupStr ? Math.floor(Number(groupStr)) : lastGroup;

    if (groupNum === null || !Number.isFinite(groupNum) || groupNum < 1) {
      invalidRows.push({ rowData: raw, rowIndex, errorMessage: "Kolom OrderGroup wajib diisi dengan angka ≥ 1 pada baris pertama setiap order" });
      continue;
    }

    const namaToko = String(raw.NamaToko ?? "").trim() || (groupNum === lastGroup ? lastNamaToko : "");
    if (!namaToko) {
      invalidRows.push({ rowData: raw, rowIndex, errorMessage: "Kolom NamaToko wajib diisi pada baris pertama setiap OrderGroup" });
      continue;
    }

    lastGroup = groupNum;
    lastNamaToko = namaToko;
    if (!groupMap.has(groupNum)) groupMap.set(groupNum, { namaToko, rows: [] });
    groupMap.get(groupNum)!.rows.push({ raw, rowIndex });
  }

  // ── Validasi & resolve setiap order ─────────────────────────────────────────
  type ResolvedOrder = {
    tokoId: number; cabangId: number;
    items: { produkId: number; satuanId: number | null; qty: number; hargaSatuan: number; diskonPersenApplied: number; diskonRupiahApplied: number }[];
  };
  const readyOrders: ResolvedOrder[] = [];

  for (const [, grp] of groupMap) {
    const tokoData = tokoMap.get(grp.namaToko.toLowerCase());
    if (!tokoData) {
      for (const { raw, rowIndex } of grp.rows)
        invalidRows.push({ rowData: raw, rowIndex, errorMessage: `Toko "${grp.namaToko}" tidak ditemukan` });
      continue;
    }

    const items: ResolvedOrder["items"] = [];
    let groupFailed = false;

    for (const { raw, rowIndex } of grp.rows) {
      const errors: string[] = [];

      const sku = String(raw.SKU ?? "").trim();
      if (!sku) errors.push("Kolom SKU wajib diisi");
      const produkId = produkMap.get(sku.toLowerCase());
      if (sku && !produkId) errors.push(`SKU "${sku}" tidak ditemukan`);

      const qty = Number(raw.Qty);
      if (raw.Qty === undefined || raw.Qty === null || String(raw.Qty).trim() === "") errors.push("Kolom Qty wajib diisi");
      else if (!Number.isInteger(qty) || qty <= 0) errors.push("Qty harus bilangan bulat > 0");

      const satuan = String(raw.Satuan ?? "").trim();
      if (!satuan) errors.push("Kolom Satuan wajib diisi");

      if (errors.length > 0) { invalidRows.push({ rowData: raw, rowIndex, errorMessage: errors.join("; ") }); groupFailed = true; continue; }

      const hargaSatuan = hargaMap.get(`${produkId}_${tokoData.cabangId}`) ?? 0;

      let diskonPersenApplied = 0, diskonRupiahApplied = 0;
      const dpRaw = raw.DiskonPersen;
      if (dpRaw !== undefined && dpRaw !== null && String(dpRaw).trim() !== "") {
        const dp = Number(dpRaw);
        if (!Number.isFinite(dp) || dp < 0 || dp > 100) {
          invalidRows.push({ rowData: raw, rowIndex, errorMessage: "DiskonPersen harus antara 0–100" });
          groupFailed = true; continue;
        }
        diskonPersenApplied = dp;
        diskonRupiahApplied = Math.round((hargaSatuan * dp) / 100);
      } else {
        const md = diskonMap.get(`${produkId}_${tokoData.id}`);
        if (md) { diskonPersenApplied = md.diskonPersen; diskonRupiahApplied = md.diskonRupiah; }
      }

      const satuanId = satuanMap.get(`${produkId}_${satuan.toLowerCase()}`) ?? null;
      items.push({ produkId: produkId!, satuanId, qty, hargaSatuan, diskonPersenApplied, diskonRupiahApplied });
    }

    if (!groupFailed && items.length > 0)
      readyOrders.push({ tokoId: tokoData.id, cabangId: tokoData.cabangId, items });
  }

  // ── Insert ───────────────────────────────────────────────────────────────────
  let insertedCount = 0;
  if (readyOrders.length > 0) {
    try {
      await db.transaction(async (tx) => {
        for (const o of readyOrders) {
          const [created] = await tx.insert(order).values({ tokoId: o.tokoId, userId: u.id, cabangId: o.cabangId, tanggal: new Date(), status: "pending", tipe: "taking_order" }).returning({ id: order.id });
          await tx.insert(orderItem).values(o.items.map((item) => ({ orderId: created.id, ...item })));
          insertedCount++;
        }
      });
    } catch (err) {
      invalidRows.push({ rowData: {}, rowIndex: 0, errorMessage: err instanceof Error ? err.message : String(err) });
      insertedCount = 0;
    }
  }

  const failedCount = invalidRows.length;
  let errorFileBase64: string | null = null;

  if (failedCount > 0) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Error_Order");
    ws.columns = [
      { header: "No. Baris",    key: "No. Baris",    width: 12 },
      { header: "OrderGroup",   key: "OrderGroup",    width: 13 },
      { header: "NamaToko",     key: "NamaToko",      width: 28 },
      { header: "SKU",          key: "SKU",            width: 18 },
      { header: "Qty",          key: "Qty",            width: 10 },
      { header: "Satuan",       key: "Satuan",         width: 15 },
      { header: "DiskonPersen", key: "DiskonPersen",   width: 14 },
      { header: "Alasan_Error", key: "Alasan_Error",   width: 55 },
    ];
    const hRow = ws.getRow(1);
    hRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    hRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDC2626" } };
    hRow.height = 22;
    for (const inv of invalidRows) {
      const r = ws.addRow({ "No. Baris": inv.rowIndex || "?", OrderGroup: String(inv.rowData?.OrderGroup ?? ""), NamaToko: String(inv.rowData?.NamaToko ?? ""), SKU: String(inv.rowData?.SKU ?? ""), Qty: String(inv.rowData?.Qty ?? ""), Satuan: String(inv.rowData?.Satuan ?? ""), DiskonPersen: String(inv.rowData?.DiskonPersen ?? ""), Alasan_Error: inv.errorMessage });
      r.getCell("Alasan_Error").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF9C3" } };
    }
    ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
    errorFileBase64 = Buffer.from(await wb.xlsx.writeBuffer()).toString("base64");
  }

  if (insertedCount === 0 && failedCount > 0)
    return { status: "all_failed", total: rawData.length, insertedCount: 0, failedCount, errorFileBase64: errorFileBase64! };
  if (failedCount === 0)
    return { status: "all_success", total: rawData.length, insertedCount, failedCount: 0, errorFileBase64: null };
  return { status: "partial_success", total: rawData.length, insertedCount, failedCount, errorFileBase64 };
}
