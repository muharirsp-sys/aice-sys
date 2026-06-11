"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { rupiah } from "@/lib/format";
import { btn } from "@/lib/ui";

// Normalisasi nomor lokal ke format internasional WA (62…).
function waNumber(noTelp: string): string {
  const digits = noTelp.replace(/\D/g, "");
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

// Kirim faktur ke WA toko dari HP sales: primer Web Share API (PDF asli ikut
// terkirim, Android Chrome), fallback link wa.me berisi ringkasan + URL publik.
export function KirimWaButton({
  orderId,
  shareToken,
  noTelp,
  tokoNama,
  total,
}: {
  orderId: number;
  shareToken: string | null;
  noTelp: string | null;
  tokoNama: string;
  total: number;
}) {
  const [busy, setBusy] = useState(false);

  const ringkasan = `Faktur INV-${orderId} — ${tokoNama}\nTotal: ${rupiah(total)}\nTerima kasih atas pesanannya.`;

  function openWaLink() {
    const link = shareToken ? `\n\nLihat faktur: ${window.location.origin}/f/${shareToken}` : "";
    const target = noTelp
      ? `https://wa.me/${waNumber(noTelp)}?text=${encodeURIComponent(ringkasan + link)}`
      : `https://wa.me/?text=${encodeURIComponent(ringkasan + link)}`;
    window.open(target, "_blank", "noopener,noreferrer");
  }

  async function kirim() {
    setBusy(true);
    try {
      const res = await fetch(`/pdf/faktur/${orderId}`);
      if (res.ok && typeof navigator.share === "function") {
        const blob = await res.blob();
        const file = new File([blob], `faktur-${orderId}.pdf`, { type: "application/pdf" });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], text: ringkasan });
          return;
        }
      }
      openWaLink();
    } catch (e) {
      // Share dibatalkan user → diam; selain itu fallback ke link wa.me.
      if (!(e instanceof DOMException && e.name === "AbortError")) openWaLink();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className={btn.primary} disabled={busy} onClick={kirim} title={noTelp ? `Kirim ke ${noTelp}` : "No. telp toko kosong — WA terbuka tanpa tujuan"}>
      <MessageCircle className="size-4" /> {busy ? "Menyiapkan…" : "Kirim via WA"}
    </button>
  );
}
