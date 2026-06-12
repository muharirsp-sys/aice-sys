// Tipe data shared antara server queries dan UI client components.
// Sumber kebenaran ada di sini; jangan define ulang di _components.

export type PosisiStokRow = {
  produkId: number;
  namaProduk: string;
  sku: string;
  satuan: string;
  qty: number;
  updatedAt: Date | null;
};

// Mencakup tipe lama (MASUK/KELUAR/KOREKSI) untuk backward compat tampilan data existing.
export type KartuStokTipe = "IN" | "OUT" | "ADJUSTMENT" | "SALDO_AWAL" | "MASUK" | "KELUAR" | "KOREKSI";

export type KartuStokRow = {
  id: number;
  createdAt: Date;
  tipe: KartuStokTipe;
  qty: number;
  qtySaldo: number;
  referenceId: string | null;
  keterangan: string | null;
  namaProduk: string;
  namaUser: string;
};
