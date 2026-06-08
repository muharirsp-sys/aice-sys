# Deploy ke VPS dengan Coolify

Referensi: https://coolify.io/

> **Catatan DB:** aplikasi ini memakai **SQLite** (file), bukan PostgreSQL. Jadi
> langkah "tambah PostgreSQL" diganti dengan **persistent volume** (di bawah).
> Konsekuensi: jalankan **satu instance** (jangan multi-replica) karena SQLite
> berbasis file tunggal.

## 1. Install Coolify di VPS
SSH ke VPS (Ubuntu/Debian), lalu jalankan installer resmi:

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Buka `http://<IP-VPS>:8000`, buat akun admin pertama.
(Disarankan VPS ≥ 2GB RAM. Untuk VPS kecil, lihat **§6 Swap** lebih dulu.)

## 2. Hubungkan repo GitHub (GitHub App)
- Coolify → **Sources** → **GitHub** → **Create GitHub App**, ikuti wizard
  (install App ke akun/repo, beri akses repo ini).
- **Projects** → **New Resource** → **Application** → pilih repo & branch (mis. `main`).
- **Build Pack: Dockerfile** (repo sudah punya `Dockerfile` di root).
- Port aplikasi: **3000**.

## 3. Persistent storage (ganti peran PostgreSQL)
Di resource aplikasi → **Storages** → tambah dua **Persistent Volume**:

| Mount path           | Fungsi                                  |
|----------------------|-----------------------------------------|
| `/data`              | File database SQLite (`aice.db`)        |
| `/app/public/uploads`| Bukti foto terima & bukti bayar         |

Tanpa ini, data & bukti hilang setiap redeploy.

## 4. Environment variables
Di **Environment Variables**, set (lihat `.env.production.example`):

| Key | Nilai |
|---|---|
| `DATABASE_URL` | `/data/aice.db` |
| `BETTER_AUTH_SECRET` | hasil `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | `https://<domain-anda>` (harus = domain publik) |
| `NODE_ENV` | `production` |

## 5. Migration & seed
- **Migration**: otomatis saat container start (`scripts/migrate.mjs` dijalankan
  sebelum `next start`) — idempotent, aman tiap deploy.
- **Seed awal (opsional, sekali saja)**: untuk membuat user/role/cabang contoh,
  jalankan via Coolify **Terminal/Exec** ke container:
  ```bash
  pnpm db:seed
  ```
  > Seed **menghapus & mengisi ulang** data contoh — jangan jalankan di produksi
  > yang sudah berisi data nyata. Untuk produksi sungguhan, buat master data
  > lewat menu **Master** (Owner) dan ganti password default.

## 6. Domain + SSL otomatis
- Arahkan **A record** domain ke IP VPS.
- Di resource → **Domains**, isi `https://<domain-anda>`. Coolify menerbitkan
  sertifikat **Let's Encrypt** otomatis.
- Pastikan `BETTER_AUTH_URL` = domain yang sama (kalau beda, login ditolak karena
  origin check Better Auth).
- **Deploy**.

## 7. Swap untuk VPS kecil (penting)
Build Next.js (Turbopack) butuh ~1GB+ RAM; VPS 1GB bisa kehabisan memori saat
build/`pnpm install`. Tambahkan swap **sebelum** deploy pertama:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab   # persist setelah reboot
free -h   # verifikasi swap aktif
```

## Backup (disarankan)
Karena DB = satu file, backup mudah: salin `/data/aice.db` berkala
(mis. cron `sqlite3 /data/aice.db ".backup /backup/aice-$(date +%F).db"`).
