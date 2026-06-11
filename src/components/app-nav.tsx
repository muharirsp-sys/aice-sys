/*
Tujuan: Menampilkan navigasi dashboard yang sesuai dengan hak akses role aktif.
Caller: DashboardShell.
Dependensi: Next Link/pathname, ikon Lucide, dan definisi RoleName.
Main Functions: AppNav.
Side Effects: Navigasi client-side.
*/

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShoppingCart,
  ClipboardCheck,
  PackageCheck,
  Truck,
  Wallet,
  CalendarCheck,
  LayoutDashboard,
  ScrollText,
  Database,
  FileSpreadsheet,
} from "lucide-react";
import type { RoleName } from "@/lib/roles";

const LINKS = [
  { href: "/owner", label: "Owner", Icon: LayoutDashboard },
  { href: "/sales", label: "Order Entry", Icon: ShoppingCart },
  { href: "/admin", label: "Approval", Icon: ClipboardCheck },
  { href: "/gudang", label: "Gudang", Icon: PackageCheck },
  { href: "/delivery", label: "Delivery", Icon: Truck },
  { href: "/incaso", label: "Incaso", Icon: Wallet },
  { href: "/closing", label: "Closing", Icon: CalendarCheck },
  { href: "/master", label: "Master", Icon: Database },
  { href: "/laporan", label: "Laporan", Icon: FileSpreadsheet },
  { href: "/audit", label: "Audit", Icon: ScrollText },
];

const ALL_PATHS = LINKS.map((link) => link.href);

// Tiap peran melihat modulnya; super admin melihat seluruh modul.
const ALLOWED: Record<RoleName, string[]> = {
  sales: ["/sales", "/closing"],
  admin_fakturist: ["/admin", "/closing"],
  gudang: ["/gudang", "/closing"],
  delivery: ["/delivery", "/closing"],
  incaso: ["/incaso", "/closing"],
  owner: ["/owner", "/master", "/laporan", "/closing", "/audit"],
  super_admin: ALL_PATHS,
};

export function AppNav({ role }: { role: RoleName | null }) {
  const pathname = usePathname();
  const allowed = role ? ALLOWED[role] : ALL_PATHS;
  const links = LINKS.filter((l) => allowed.includes(l.href));

  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto pb-0.5">
      {links.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors duration-150 ease-[cubic-bezier(0.2,0,0,1)] ${
              active
                ? "bg-primary/12 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
