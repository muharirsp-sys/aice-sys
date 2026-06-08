import type { MetadataRoute } from "next";

// Web App Manifest (installable). Warna selaras brand §8 (hijau tua + kertas hangat).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Aice — Konsol Operasi FMCG",
    short_name: "Aice",
    description:
      "Sistem Order-to-Cash distributor FMCG: transparan, anti-fraud, akuntabel.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "id",
    background_color: "#faf9f4",
    theme_color: "#1f7a52",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
