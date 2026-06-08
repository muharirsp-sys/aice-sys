import { Boxes } from "lucide-react";
import { namaCabang } from "@/server/queries";
import { ROLE_LABEL, roleNameFromId } from "@/lib/roles";
import { AppNav } from "./app-nav";
import { LogoutButton } from "./logout-button";

type Props = {
  userName: string;
  roleId: number;
  cabangId: number;
  children: React.ReactNode;
};

// Kerangka aplikasi: header identitas + navigasi (difilter peran) + area konten.
export async function DashboardShell({ userName, roleId, cabangId, children }: Props) {
  const roleName = roleNameFromId(roleId);
  const roleLabel = roleName ? ROLE_LABEL[roleName] : "Pengguna";
  const cabang = await namaCabang(cabangId);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-center gap-3 py-3">
            <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
              <Boxes className="size-5" strokeWidth={2.25} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-bold leading-tight tracking-tight">
                Aice — Konsol Operasi
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {cabang} · {userName} ·{" "}
                <span className="text-foreground">{roleLabel}</span>
              </p>
            </div>
            <LogoutButton />
          </div>
          <div className="pb-2">
            <AppNav role={roleName} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
