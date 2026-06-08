import { WifiOff } from "lucide-react";

// Halaman fallback offline (publik, tanpa auth). Ditampilkan SW saat navigasi gagal.
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-md bg-muted">
          <WifiOff className="size-6 text-muted-foreground" />
        </span>
        <h1 className="mt-4 font-display text-xl font-bold tracking-tight">Sedang Offline</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tidak ada koneksi internet. Sebagian data yang sudah pernah dibuka tetap
          tersedia. Coba lagi setelah koneksi kembali.
        </p>
      </div>
    </main>
  );
}
