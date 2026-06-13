"use server";

import { buildUploadTemplate, type TemplateCol } from "@/lib/excel";

export type UploadModule = "produk" | "toko" | "harga" | "diskon" | "order" | "stok";

const TEMPLATES: Record<UploadModule, { sheetName: string; cols: TemplateCol[] }> = {
  produk: {
    sheetName: "Template_Produk",
    cols: [
      { header: "Nama",           width: 30, example: "Aqua 600ml" },
      { header: "SKU",            width: 20, example: "AQU-600" },
      { header: "Satuan",         width: 15, example: "pcs" },
      { header: "SatuanTambahan", width: 25, example: "dus|karton", required: false },
    ],
  },
  toko: {
    sheetName: "Template_Toko",
    cols: [
      { header: "Nama",       width: 30, example: "Warung Bu Sari" },
      { header: "NamaCabang", width: 25, example: "Cabang Jakarta Pusat" },
      { header: "Alamat",     width: 40, example: "Jl. Merdeka No. 1", required: false },
      { header: "NoTelp",     width: 20, example: "08123456789",        required: false },
    ],
  },
  harga: {
    sheetName: "Template_Harga",
    cols: [
      { header: "SKU",        width: 20, example: "AQU-600" },
      { header: "NamaCabang", width: 25, example: "Cabang Jakarta Pusat" },
      { header: "Harga",      width: 18, example: 5000 },
    ],
  },
  diskon: {
    sheetName: "Template_Diskon",
    cols: [
      { header: "NamaToko",      width: 30, example: "Warung Bu Sari" },
      { header: "SKU",           width: 20, example: "AQU-600" },
      { header: "DiskonPersen",  width: 16, example: 5 },
      { header: "DiskonRupiah",  width: 16, example: 250 },
      { header: "BatasPersen",   width: 16, example: 10 },
      { header: "BatasRupiah",   width: 16, example: 500 },
    ],
  },
  order: {
    sheetName: "Template_Order",
    cols: [
      { header: "OrderGroup",   width: 14, example: 1 },
      { header: "NamaToko",     width: 30, example: "Warung Bu Sari" },
      { header: "SKU",          width: 20, example: "AQU-600" },
      { header: "Qty",          width: 10, example: 10 },
      { header: "Satuan",       width: 15, example: "pcs" },
      { header: "DiskonPersen", width: 16, example: 5, required: false },
    ],
  },
  stok: {
    sheetName: "Template_Stok",
    cols: [
      { header: "SKU",     width: 20, example: "AQU-600" },
      { header: "Qty",     width: 10, example: 24 },
      { header: "Jenis",   width: 14, example: "masuk" },
      { header: "Catatan", width: 35, example: "Stok opname Juni 2026", required: false },
    ],
  },
};

export async function getUploadTemplate(
  module: UploadModule,
): Promise<{ base64: string; filename: string }> {
  const def = TEMPLATES[module];
  const buf = await buildUploadTemplate(def.sheetName, def.cols);
  return {
    base64: buf.toString("base64"),
    filename: `template-${module}.xlsx`,
  };
}
