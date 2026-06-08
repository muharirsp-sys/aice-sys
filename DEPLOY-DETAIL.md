# Setup Aice di VPS dari 0 (Detail Step-by-Step)

Instruksi ini untuk deploy ke VPS baru dengan Coolify. VPS disarankan **Ubuntu 22.04+** atau **Debian 12+**, minimal **2GB RAM** (lebih baik 4GB+).

---

## Fase 0: Persiapan VPS (sebelum Coolify)

### 0.1 Pastikan akses SSH
```bash
# Dari laptop, test SSH ke VPS
ssh root@<IP-VPS>
# atau jika punya user biasa:
ssh user@<IP-VPS>
```
Jika berhasil, lanjut. Jika tidak, minta akses SSH ke VPS provider.

### 0.2 Update sistem
```bash
sudo apt update && sudo apt upgrade -y
```

### 0.3 Install swap (PENTING jika RAM < 4GB)
Jika VPS kamu hanya 1-2GB RAM, **WAJIB** tambah swap sekarang, sebelum install Coolify.

```bash
# Buat file swap 2GB
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Verifikasi swap aktif
free -h
# Output contoh:
#               total        used        free      shared  buff/cache   available
# Mem:          1.9Gi       450Mi       1.2Gi       2.0Mi       451Mi       1.4Gi
# Swap:         2.0Gi          0B       2.0Gi

# Persist swap setelah reboot
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 0.4 Arahkan DNS domain (sebelum SSL)
Di registrar domain kamu, buat **A record**:
```
Hostname: aice  (atau @)
Type: A
Value: <IP-VPS>
TTL: 3600
```
Contoh hasil: `aice.example.com` → IP VPS.

**Tunggu propagasi** (bisa 5 menit — 1 jam). Test dengan:
```bash
nslookup aice.example.com
# atau
dig aice.example.com
```
Jika return IP VPS kamu, lanjut.

---

## Fase 1: Install Coolify

### 1.1 SSH ke VPS dan jalankan installer
```bash
ssh root@<IP-VPS>
# atau
ssh user@<IP-VPS>
sudo -i  # jika bukan root

# Install Coolify
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

**Output yang diharap:**
```
Coolify is starting...
Go to http://<IP-VPS>:8000 to start using Coolify
```

Tunggu ~30 detik. Jangan tutup terminal.

### 1.2 Buka Coolify dashboard
Di browser (laptop), buka:
```
http://<IP-VPS>:8000
```

Akan muncul layar setup pertama kali:
- **Email**: isi dengan email kamu (admin Coolify)
- **Password**: isi password kuat (untuk login Coolify nanti)

Klik **"Setup"** atau **"Create Account"**.

**Setelah berhasil**, dashboard Coolify akan terbuka (blank, belum ada app).

---

## Fase 2: Setup GitHub Connection (untuk pull code)

### 2.1 Di Coolify dashboard, buat GitHub App
- Klik menu **Settings** (gear icon, kanan atas)
- Pilih **Sources** (sidebar kiri)
- Klik **GitHub** → **Create GitHub App**
- Coolify akan membuka halaman GitHub, ikuti wizard:
  1. "Authorize Coolify" → klik **green button**
  2. Pilih nama app (default: "Coolify")
  3. **Install**: pilih akun GitHub kamu → **Only select repositories** → pilih **aice-pwa** repo
  4. Klik **Install & Authorize**

### 2.2 Kembali ke Coolify dashboard
Akan muncul konfirmasi "GitHub connected successfully".

---

## Fase 3: Buat Resource Aplikasi di Coolify

### 3.1 Buat project baru
- Klik **Projects** (menu atas)
- Klik **+ New Project**
- Isi nama: `aice` (atau sesuka)
- Klik **Create**

### 3.2 Tambah application
- Di project **aice**, klik **+ New Resource** → **Application**
- Pilih **GitHub** sebagai source
- Pilih repository: **aice-pwa**
- Pilih branch: **main** (atau cabang deploy-mu)
- Klik **Save**

### 3.3 Atur build & port
Di resource aplikasi, tab **Basics**:
- **Build Pack**: pilih **Dockerfile** (sudah ada di repo root)
- **Port**: `3000`
- Klik **Save**

---

## Fase 4: Setup Database & File Storage (Persistent Volume)

**Penting**: tanpa ini, data & bukti foto hilang tiap redeploy.

### 4.1 Tambah volume untuk database
Di resource aplikasi, tab **Storages** → **+ Add Persistent Volume**:
- **Mount Path**: `/data`
- **Size**: `5G` (cukup untuk 1000+ order)
- Klik **Save**

### 4.2 Tambah volume untuk bukti upload
Tab **Storages** → **+ Add Persistent Volume**:
- **Mount Path**: `/app/public/uploads`
- **Size**: `10G` (untuk foto terima & bukti bayar)
- Klik **Save**

---

## Fase 5: Set Environment Variables

### 5.1 Generate BETTER_AUTH_SECRET
Jalankan di VPS (atau laptop):
```bash
openssl rand -base64 32
# Output contoh: dK7x9mN2qP1wL8sY5rF4hJ6gT3uX0vB2zM+= (copy ini)
```

### 5.2 Set env vars di Coolify
Di resource aplikasi, tab **Environment Variables**, tambah:

| Key | Nilai |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `/data/aice.db` |
| `BETTER_AUTH_SECRET` | (hasil `openssl rand -base64 32` dari 5.1) |
| `BETTER_AUTH_URL` | `https://aice.example.com` (ganti dengan domain kamu) |

**Penting**: `BETTER_AUTH_URL` HARUS sama dengan domain yang akan kamu pakai. Jika beda, login akan ditolak.

Klik **Save** setiap field.

---

## Fase 6: Setup Domain & SSL

### 6.1 Tambah domain ke resource
Di resource aplikasi, tab **Domains** → **+ Add Domain**:
- **Domain**: `aice.example.com` (ganti dengan domain kamu)
- Klik **Save**

Coolify akan otomatis:
- Cek DNS pointing ke VPS
- Issue sertifikat Let's Encrypt (bisa 2-5 menit)

**Status akan berubah** dari "Pending" → "Active" (dengan padlock icon).

### 6.2 Update firewall (jika ada)
VPS harus membuka port:
- **80** (HTTP, untuk Let's Encrypt renewal)
- **443** (HTTPS, traffic aplikasi)

---

## Fase 7: Deploy Aplikasi

### 7.1 Trigger build
Di resource aplikasi, klik **Deploy** (tombol biru, kanan atas).

**Apa yang terjadi**:
1. Coolify pull code dari GitHub (`main` branch)
2. Build Docker image (`pnpm build` + compile Next.js — butuh 5-15 menit, tergantung koneksi & RAM)
3. Start container dengan migration (`scripts/migrate.mjs` jalan otomatis)
4. Container listen di port 3000, Coolify proxy ke domain `:443` (HTTPS)

### 7.2 Monitor build
Klik **Logs** (tab atau icon) untuk lihat progress:
```
[build] Creating image...
[build] Running RUN pnpm build...
✓ Compiled successfully in 5.1s
✓ Generating static pages using 15 workers (17/17)...
[migrate] applied -> /data/aice.db
Ready on http://0.0.0.0:3000
```

**Jika muncul error**:
- `permission denied`: cek apakah volume `/data` bisa write
- `out of memory`: swap belum ada (lihat Fase 0.3)
- `pnpm install failed`: cek internet VPS (`ping google.com`)

---

## Fase 8: Verifikasi & Login Pertama

### 8.1 Cek aplikasi hidup
Buka di browser:
```
https://aice.example.com
```

**Harusnya redirect ke `/login`** (jika session belum ada).

### 8.2 Login pakai user default
Dari seed data, user default:
- **Email**: `owner@aice.test`
- **Password**: `password123`

Klik login, harusnya muncul dashboard Owner.

### 8.3 Ganti password default (SECURITY)
- Login dengan akun default di atas
- Click nama user (kanan atas) → **Settings** (atau cari menu Account)
- **Change Password**: isi password baru kuat
- Simpan

---

## Fase 9: Setup Master Data (Opsional, untuk Data Produksi)

### 9.1 Jika sudah ada data nyata (tidak gunakan seed)
**Jangan** jalankan `pnpm db:seed` di container! Seed menghapus & isi ulang data.

Sebagai gantinya, gunakan menu **Master** di UI:
- Login sebagai Owner
- Click **Master** (sidebar)
- Buat **Cabang**, **Produk**, **Toko**, **Harga**, **Diskon** lewat UI form

### 9.2 Jika butuh data contoh untuk testing
Sekali saja, jalankan seed via Coolify **Terminal**:
- Resource aplikasi → **Terminal** (tab)
- Ketik:
  ```bash
  pnpm db:seed
  ```
  Tunggu selesai (~5 detik).

**PERINGATAN**: seed menghapus SEMUA data & mengisi ulang contoh. Hanya untuk test!

---

## Fase 10: Setup Backup Otomatis (Disarankan)

### 10.1 Backup manual satu kali
```bash
# SSH ke VPS
ssh root@<IP-VPS>

# Backup file database
cp /var/lib/docker/volumes/<coolify-volume-id>/_data/data/aice.db /home/user/backup/aice-$(date +%F).db
```

### 10.2 Setup cron untuk backup harian (opsional)
```bash
# Edit crontab
crontab -e

# Tambah baris (backup setiap jam 2 pagi):
0 2 * * * sqlite3 /data/aice.db ".backup /backup/aice-$(date +\\%F).db" 2>&1 | logger -t aice-backup
```

**Catatan**: path `/backup/` harus ada atau ganti ke folder yang ada (mis. `/home/user/backup/`).

---

## Troubleshooting Cepat

| Masalah | Solusi |
|---|---|
| **Build kehabisan RAM** | Swap belum ada (Fase 0.3) atau too small. Tambah swap baru: `sudo fallocate -l 4G /swapfile2` |
| **Domain tidak connect** | A record belum propagate (tunggu lebih lama) atau VPS firewall block port 80/443. Cek: `curl http://aice.example.com` |
| **SSL "pending" forever** | DNS not pointing to VPS. Verifikasi: `dig aice.example.com +short` harus return IP VPS. |
| **Login ditolak (401)** | `BETTER_AUTH_URL` di env vars tidak sama dengan domain di browser. Cocokkan. |
| **Database file kosong** | Volume tidak di-mount dengan benar. Cek Fase 4, pastikan `/data` mount path benar. |
| **Buildbulan" (stuck) | Cek logs. Jika `npm ERR`, bisa package download macet. Restart container: Coolify → **Actions** → **Restart**. |

---

## Selesai!

Kamu sekarang punya Aice running di VPS, HTTPS + Let's Encrypt, persistent data.

**Next steps** (opsional):
1. **Setup backup automatis** (Fase 10.2)
2. **Ganti password default** untuk semua user (Owner dulu, lalu buat user lain via Master)
3. **Monitor logs** rutin: dashboard Coolify → Resources → Logs

Pertanyaan? Minta bantuan setup di sini.
