import { STATUS_META, type OrderStatus } from "@/lib/order-status";

// Status Pill konsisten lintas modul (§8.6). Warna semantik dari STATUS_META.
export function StatusPill({ status }: { status: OrderStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${m.cls}`}
    >
      {m.label}
    </span>
  );
}
