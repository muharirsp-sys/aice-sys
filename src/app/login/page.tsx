"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, LogIn, AlertCircle } from "lucide-react";
import { signIn } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signIn.email({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message ?? "Email atau kata sandi salah.");
      return;
    }
    // Root me-redirect ke dashboard sesuai peran.
    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-md bg-primary text-primary-foreground">
            <Boxes className="size-6" strokeWidth={2.25} />
          </span>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight">
              Aice — Konsol Operasi
            </h1>
            <p className="text-sm text-muted-foreground">Masuk untuk melanjutkan</p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-lg border bg-card p-5"
          noValidate
        >
          {error && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-md border border-l-4 border-l-critical bg-critical/10 p-3 text-sm text-critical"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <label className="mb-1.5 block text-sm font-semibold" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-4 h-11 w-full rounded-md border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="nama@aice.test"
          />

          <label className="mb-1.5 block text-sm font-semibold" htmlFor="password">
            Kata sandi
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-5 h-11 w-full rounded-md border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="••••••••"
          />

          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-[transform,opacity] duration-150 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.99] disabled:opacity-60"
          >
            <LogIn className="size-4" />
            {loading ? "Memproses…" : "Masuk"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Akun demo (Tahap 2): <span className="tabular">owner@aice.test</span> ·
          kata sandi <span className="tabular">password123</span>
        </p>
      </div>
    </main>
  );
}
