"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { btn } from "@/lib/ui";
import { resetOrderToPending } from "@/server/actions";

export function ResetOrderButton({ orderId }: { orderId: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function doReset() {
    setErr(null);
    startTransition(async () => {
      const r = await resetOrderToPending(orderId);
      if (!r.ok) setErr(r.error);
      else router.refresh();
    });
  }

  return (
    <div>
      {err && <p className="mb-2 text-xs font-semibold text-critical">{err}</p>}
      <button onClick={doReset} disabled={pending} className={btn.outline}>
        <RotateCcw className="size-4" />
        {pending ? "Mereset…" : "Reset ke Pending (Override Owner)"}
      </button>
    </div>
  );
}
