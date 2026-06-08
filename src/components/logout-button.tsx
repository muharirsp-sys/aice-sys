"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOut } from "@/lib/auth-client";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await signOut();
        router.push("/login");
        router.refresh();
      }}
      className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold transition-colors duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-muted"
    >
      <LogOut className="size-4" />
      Keluar
    </button>
  );
}
