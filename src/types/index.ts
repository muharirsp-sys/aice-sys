// Type definitions untuk aplikasi.
// Akan diperluas sesuai kebutuhan Tahap 1+ (schema Drizzle).

export type Role = "sales" | "admin_fakturist" | "gudang" | "delivery" | "incaso" | "owner";

export interface User {
  id: number;
  nama: string;
  email: string;
  role: Role;
  cabang_id: number;
}
