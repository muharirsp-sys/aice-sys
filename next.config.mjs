/** @type {import('next').NextConfig} */
const nextConfig = {
  // Jangan di-bundle: better-sqlite3 (native), better-auth (kysely/bun dialect),
  // @react-pdf/renderer (fontkit/yoga) — di-load Node saat runtime.
  serverExternalPackages: ["better-sqlite3", "better-auth", "@react-pdf/renderer"],

  async headers() {
    return [
      {
        // Service worker selalu fresh + tipe benar (PWA).
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Header keamanan dasar (PRD §2: keamanan).
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
