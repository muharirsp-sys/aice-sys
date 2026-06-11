// Tipe & meta status order — dipakai server (DB) maupun client (UI). Tanpa data dummy.

export type OrderStatus =
  | "pending_approval"
  | "approved"
  | "rejected"
  | "ready_to_ship"
  | "delivered"
  | "paid";

export const STATUS_META: Record<OrderStatus, { label: string; cls: string }> = {
  pending_approval: { label: "Pending", cls: "bg-muted text-muted-foreground" },
  approved: { label: "Approved", cls: "bg-primary/12 text-primary" },
  rejected: { label: "Ditolak", cls: "bg-critical/12 text-critical" },
  ready_to_ship: { label: "Siap Kirim", cls: "bg-accent/15 text-accent-foreground" },
  delivered: { label: "Terkirim", cls: "bg-ok/15 text-ok" },
  paid: { label: "Lunas", cls: "bg-ok/20 text-ok" },
};

export type AlertLevel = "critical" | "warning" | "ok";

export type Divisi = {
  role: "sales" | "admin_fakturist" | "gudang" | "delivery" | "incaso";
  label: string;
  done: boolean;
  oleh?: string;
  waktu?: string;
};

export type Alert = {
  id: number;
  level: AlertLevel;
  title: string;
  desc: string;
  time: string;
};

// ── View-model yang dikembalikan query untuk komponen UI ─────────────────────
export type ItemView = {
  orderItemId: number;
  produkId: number;
  nama: string;
  sku: string;
  satuan: string;
  qty: number;
  hargaSatuan: number;
  diskonPersen: number;
  diskonRupiah: number;
};

export type OrderTipe = "taking_order" | "kanvas";

export type OrderView = {
  id: number;
  tokoId: number;
  tokoNama: string;
  tokoAlamat: string;
  salesNama: string;
  cabangId: number;
  cabangNama: string;
  tanggal: string; // ISO
  status: OrderStatus;
  tipe: OrderTipe;
  items: ItemView[];
};
