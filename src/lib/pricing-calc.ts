// Kalkulasi harga murni (tanpa DB) — dipakai client (preview), server (validasi),
// dan dokumen cetak agar hasilnya konsisten.

export type PriceableItem = {
  qty: number;
  hargaSatuan: number;
  diskonPersen: number;
  diskonRupiah: number;
};

// Subtotal 1 baris: harga kotor − diskon% − diskon Rp/unit, tidak negatif.
export function subtotalItem(it: PriceableItem): number {
  const kotor = it.qty * it.hargaSatuan;
  const setelahPersen = kotor - Math.round((kotor * it.diskonPersen) / 100);
  return Math.max(0, setelahPersen - it.diskonRupiah * it.qty);
}

export function totalItems(items: PriceableItem[]): number {
  return items.reduce((s, it) => s + subtotalItem(it), 0);
}

// Persentase perubahan hari ini vs kemarin.
export function deltaPersenOf(today: number, yesterday: number): number {
  if (yesterday === 0) return today > 0 ? 100 : 0;
  return ((today - yesterday) / yesterday) * 100;
}
