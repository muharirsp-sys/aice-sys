"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { setActiveCabangAction } from "@/server/cabang-actions";

type CabangOption = { id: number; nama: string };

export function CabangSwitcher({
  cabangs,
  activeCabangId,
}: {
  cabangs: CabangOption[];
  activeCabangId: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    const id = val === "" ? null : Number(val);
    startTransition(async () => {
      await setActiveCabangAction(id);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
      <select
        value={activeCabangId ?? ""}
        onChange={onChange}
        disabled={pending}
        className="max-w-[130px] cursor-pointer truncate border-0 border-b border-dashed border-muted-foreground/40 bg-transparent text-xs text-foreground transition-colors hover:border-foreground focus:outline-none disabled:opacity-50"
      >
        <option value="">Semua Cabang</option>
        {cabangs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nama}
          </option>
        ))}
      </select>
    </div>
  );
}
