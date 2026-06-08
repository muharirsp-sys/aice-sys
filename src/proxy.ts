import { NextRequest, NextResponse } from "next/server";

// Konvensi Next 16: "proxy" (sebelumnya "middleware").
// Nama cookie sesi Better Auth (default prefix "better-auth"; varian secure di HTTPS).
const SESSION_COOKIES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
];

// Proteksi optimistik berbasis keberadaan cookie sesi (tanpa query DB / import lib —
// aman di edge runtime). Otorisasi peran divalidasi di Server Component via requireRole().
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = SESSION_COOKIES.some(
    (name) => request.cookies.get(name) != null,
  );

  // Sudah login tapi membuka /login -> arahkan ke root (root me-redirect ke dashboard peran).
  if (pathname === "/login") {
    if (hasSession) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  // Belum login -> paksa ke /login.
  if (!hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Lindungi semua rute kecuali aset statis, route handler auth, dan file publik.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|manifest.webmanifest|icons|sw.js|offline).*)",
  ],
};
