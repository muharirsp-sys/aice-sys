<!--
Tujuan: Peta ringkas arsitektur, entry point, dan alur utama aplikasi Aice Sys3.
Caller: Developer dan AI agent saat menelusuri perubahan atau insiden.
Dependensi: package.json, Dockerfile, src/app, src/lib, src/server, src/db.
Main Functions: Navigasi lokasi fungsi kunci dan trace alur aplikasi.
Side Effects: Tidak ada; dokumentasi saja.
-->

# SYSTEM MAP

## Stack dan Runtime

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS.
- Better Auth untuk login email/password dan session cookie.
- Drizzle ORM + `better-sqlite3`; database produksi adalah file SQLite.
- Docker multi-stage; Coolify menjalankan satu container aplikasi pada port 3000.
- Persistent storage produksi:
  - `/data` untuk `/data/aice.db`.
  - `/app/public/uploads` untuk file bukti.

## Entry Point dan Lapisan

| Area | Entry / Trigger | Handler / UI | Business / Auth | Data Access / Storage |
|---|---|---|---|---|
| Login | `src/app/login/page.tsx` | `signIn.email()` | `src/lib/auth-client.ts`, `src/lib/auth.ts` | Better Auth Drizzle adapter -> `src/db/index.ts` -> SQLite |
| Auth API | `/api/auth/*` | `src/app/api/auth/[...all]/route.ts` | Better Auth handler | Tabel `user`, `account`, `session`, `verification` di `src/db/schema.ts` |
| Proteksi rute | Request halaman | `src/proxy.ts` | Cookie check; role/super-admin check di `src/lib/session.ts`, `src/lib/roles.ts` | Session Better Auth |
| Dashboard | `/` dan route per peran | `src/app/**/page.tsx` | `src/server/queries.ts`, `src/server/actions.ts`, modul server terkait | Drizzle -> SQLite |
| Master data | `/master` | `src/components/master/master-client.tsx` | `src/server/master-actions.ts` | Drizzle -> tabel master |
| Upload | Form/action terkait | `src/server/upload.ts` | Validasi dan penyimpanan file | `/app/public/uploads` |
| PDF | `/pdf/*` | `src/app/pdf/**/route.ts` | `src/pdf/documents.tsx` | Query SQLite, respons PDF |
| Kanvas luar kota | `/sales/kanvas`, panel Muatan Kanvas di `/gudang` | `src/app/sales/kanvas/**`, `src/components/kanvas/*` | `src/server/kanvas-actions.ts`, `src/server/kanvas-queries.ts` | Tabel `trip_kanvas`, `trip_item`; kolom `order.tipe/trip_id/share_token` |
| Faktur publik (WA) | `/f/[token]` — tanpa login, dikecualikan di matcher `src/proxy.ts` | `src/app/f/[token]/route.ts` | `getOrderByShareToken()` + `renderFakturPdf()` | Lookup `order.share_token`, respons PDF |

## Modul Kanvas Luar Kota

- Trip: sales mengajukan muatan (`diajukan`) → gudang konfirmasi muat (`berjalan`) → sales mengakhiri trip + qty kembali (`rekonsiliasi`) → gudang verifikasi (`selesai`).
- Faktur kanvas (`order.tipe = 'kanvas'`) terbit langsung berstatus `delivered` tanpa approval admin; kontrol pengganti: harga/diskon via `priceOrderLines()` dan guard qty ≤ sisa muatan trip.
- Qty terjual tidak disimpan — dihitung dari `order_item` join `order.trip_id` (exclude `rejected`).
- Pembayaran tunai dicatat sales sendiri (`recordKanvasPayment`); faktur tempo muncul di antrean Incaso (status `delivered`).
- Kirim faktur ke WA toko dari HP sales: Web Share API (PDF asli) dengan fallback link `wa.me` berisi URL publik `/f/[share_token]`.
- Selisih rekonsiliasi (muat ≠ terjual + kembali) wajib catatan gudang dan tercatat di audit log.

## Alur Login

1. Pengguna submit email/password di `src/app/login/page.tsx`.
2. `src/lib/auth-client.ts` memanggil endpoint Better Auth `/api/auth/*`.
3. `src/app/api/auth/[...all]/route.ts` meneruskan request ke konfigurasi `src/lib/auth.ts`.
4. Better Auth memakai Drizzle adapter dan schema `src/db/schema.ts`.
5. `src/db/index.ts` membuka `DATABASE_URL`, fallback lokal `./aice.db`.
6. Setelah sukses, cookie session dibuat dan root mengarahkan pengguna ke dashboard sesuai `roleId`.

## Role dan Super Admin

- Role operasional: Sales, Admin Fakturist, Gudang, Delivery, dan Incaso.
- Role pengawasan: Owner.
- Role `super_admin` (ID 7) diarahkan ke `/owner`, melihat seluruh menu, dapat membuka semua dashboard, dan dapat menjalankan action tiap role.
- `src/lib/roles.ts` adalah sumber aturan akses; `canAccessRole()` memberi bypass lintas role hanya kepada `super_admin`.
- Detail order dan PDF memakai `hasGlobalDataAccess()` agar Owner dan Super Admin dapat membaca lintas cabang.
- Akun produksi dibuat non-destruktif dengan `SUPER_ADMIN_PASSWORD='<password-kuat>' pnpm dlx tsx src/db/create-super-admin.ts`.

Konfigurasi produksi yang wajib selaras:

- `DATABASE_URL=/data/aice.db`
- `BETTER_AUTH_URL=https://domain-publik`
- `BETTER_AUTH_SECRET=<secret-kuat>`
- `NODE_ENV=production`

## Database, Migrasi, dan Seed

- Schema: `src/db/schema.ts`.
- Koneksi: `src/db/index.ts`.
- Migrasi: folder `drizzle/`.
- Startup container: `Dockerfile` menjalankan `node scripts/migrate.mjs && pnpm start`.
- Migrasi startup bersifat idempotent dan memakai `DATABASE_URL`.
- Seed: `src/db/seed.ts`.
- Seed produksi: `pnpm db:seed:prod`; mengambil environment langsung dari container.
- Seed membuat akun demo `owner@aice.test` dan `superadmin@aice.test` dengan password `password123`.
- `src/db/create-super-admin.ts` membuat/menyelaraskan akun super admin tanpa menghapus data.
- Seed bersifat destruktif: menghapus data aplikasi dan auth sebelum mengisi ulang data contoh.

## Deployment

- Build dan runtime container: `Dockerfile`.
- Panduan ringkas: `DEPLOY.md`.
- Panduan detail: `DEPLOY-DETAIL.md`.
- Contoh environment: `.env.production.example`.
- Aplikasi SQLite harus dijalankan sebagai satu replica agar tidak ada beberapa writer terhadap file yang sama.

## Aturan Penelusuran

Mulai dari entry point pada tabel, lalu ikuti:

`UI / Route -> Server Action / Auth Handler -> Module bisnis -> Drizzle -> SQLite`

Untuk file besar, baca hanya fungsi yang terkait dengan alur yang sedang diperiksa.
