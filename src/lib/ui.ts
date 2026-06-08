// Kelas utilitas konsisten (§8.4/§8.6). Transisi pendek + easing console (§8.5).
const base =
  "inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-semibold transition-[transform,background-color,opacity] duration-150 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none";

export const btn = {
  primary: `${base} h-9 px-3 bg-primary text-primary-foreground hover:opacity-90`,
  // Aksen oranye untuk lapor kendala/selisih & CTA penting (§8.6).
  accent: `${base} h-9 px-3 bg-accent text-accent-foreground hover:opacity-90`,
  outline: `${base} h-9 px-3 border hover:bg-muted`,
  ghost: `${base} h-9 px-3 hover:bg-muted`,
  danger: `${base} h-9 px-3 bg-critical text-critical-foreground hover:opacity-90`,
};

export const input =
  "h-10 w-full rounded-md border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const label = "mb-1.5 block text-sm font-semibold";
