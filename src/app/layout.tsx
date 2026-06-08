import type { Metadata, Viewport } from "next";
import { Geist, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

// Heading & angka berkarakter (§8.2). Geist bersifat variable — ringan.
const display = Geist({
  variable: "--font-display",
  subsets: ["latin"],
});

// Body & tabel — netral tapi punya identitas, terbaca di ukuran kecil (§8.2).
const sans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Angka uang & metrik — tabular, kolom rupiah rata (§8.2).
const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Aice — Konsol Operasi FMCG",
  description: "Sistem Order-to-Cash distributor FMCG: transparan, anti-fraud, akuntabel.",
  applicationName: "Aice",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Aice" },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1f7a52",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
