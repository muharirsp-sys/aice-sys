# FMCG Feature Roadmap — Aice-Sys3

**Referensi riset:** Simplidots, NexSoft ND6, Accurate Online, Altius ERP, Advdotics, Odoo FMCG  
**Status:** Gap analysis terkini, siap implementasi on client request  
**Last Updated:** 2026-06-14

---

## ✅ Sudah Ada & Live (~55% parity vs Simplidots/ND6 full feature set)

### Core Order-to-Cash
| Fitur | Detail |
|-------|--------|
| Taking Order | Standard + Kanvas luar kota multi-hari |
| Approval Workflow | Admin fakturist approve/reject + alasan tolak |
| Tanda Terima | Batch packing confirmation admin → gudang, bukti upload |
| Delivery + GPS/Foto | Proof of delivery, koordinat GPS, timestamp |
| Incaso / Payment | Multi-metode, bukti bayar upload |
| Kendala Item Flow | Shortage reporting: gudang → driver → owner approval |
| PDF Faktur + WA Share | Public token invoice via WhatsApp (tanpa login) |
| PWA Offline | Installable, service worker, offline fallback |

### Operasional & Data
| Fitur | Detail |
|-------|--------|
| Stok Gudang Real-time | `stokCabang` + `kartuStok` ledger, `/dashboard/inventory` live |
| Multi-Cabang | Harga, diskon, stok terpisah per cabang |
| Diskon per Toko | Anti-fraud caps: persen + rupiah per produk/toko |
| Multi-Satuan | `produkSatuan` — satuan default + alternatif per produk |
| Kanvas Luar Kota | Trip multi-hari, faktur langsung di toko, rekonsiliasi gudang |
| Sales Context Toko | Riwayat pembelian + top produk per toko di order form |
| Daily Closing + Lock | Per-role sign-off, owner locks date (data immutable) |
| Audit Trail Penuh | Full action log dengan old/new value, filterable |
| Laporan Export Excel | Penjualan, pembayaran, pengiriman, trip kanvas, issue — filter tanggal/cabang/toko/produk |
| Order Detail Timeline | Full lifecycle view: approval, delivery, payment, kendala |

---

## ⚡ Tier 1 — Quick Win (4 fitur, ~5 hari kerja total)

Semua bisa diimplementasi tanpa modul besar. Tidak ada arsitektur baru.

### 1. KPI Dashboard Salesman
**Effort:** ~2 hari | **Parity:** Simplidots, NexSoft ND6  
- RPP (Rata-Rata Penjualan) per salesman per minggu/bulan
- Hit rate: % toko yang pernah order dari total toko terdaftar
- Ranking omset salesman per cabang, top 10 toko by value
- Tampilan live (bukan sekadar export Excel)

**Implementasi:** Query rollup dari `order` + `orderItem` + `toko` yang sudah ada. Tidak butuh tabel baru.

---

### 2. Target Salesman
**Effort:** ~1 hari | **Parity:** Simplidots, NexSoft ND6  
- Monthly target omset (Rp) per user
- Progress bar: aktual vs target, % achievement di dashboard sales & owner

**Implementasi:**
- Tabel baru: `salesmanTarget(user_id, period_month TEXT "YYYY-MM", target_amount INTEGER)`
- Form input di master/owner, query SUM subtotal per user per bulan

---

### 3. Credit Limit Toko
**Effort:** ~1 hari | **Parity:** NexSoft ND6, Altius ERP  
- Batas piutang maksimal per toko (Rupiah)
- Soft limit: warning di order entry, masih bisa order
- Hard limit: blokir order sampai ada pembayaran

**Implementasi:**
- Kolom baru di `toko`: `credit_limit INTEGER` (NULL = tidak ada batas)
- Check piutang terbuka di `createOrder()`, UI warning di `order-entry-form.tsx`

---

### 4. AR Aging (Accounts Receivable)
**Effort:** ~1 hari | **Parity:** Accurate Online, NexSoft ND6  
- Piutang terbuka per toko dikelompokkan: 0-30 hari, 31-60, 61-90, 90+ hari
- Total outstanding per cabang, tampil di dashboard owner/incaso

**Implementasi:**
- Query baru di `report-queries.ts`: join `order` + `pembayaran` + `toko`
- Bucket by selisih hari `order.tanggal` untuk orders belum lunas
- Panel di `/owner` atau tab baru di `/laporan`

---

## 🔧 Tier 2 — Medium (5 fitur, ~15 hari kerja total)

Butuh tabel/modul baru, tidak mengubah arsitektur core.

### 5. Route Plan / Visit Schedule
**Effort:** ~4 hari | **Parity:** Simplidots, NexSoft ND6 (NexMile/JOURNEY app)  
- Jadwal kunjungan per salesman per toko per hari
- Check-in GPS saat kunjungan, plan vs aktual coverage %

**Implementasi:**
- Tabel: `visitPlan(salesman_id, toko_id, hari_kunjungan)`, `visitLog(plan_id, check_in_time, gps_coord)`
- Halaman: `/sales/route`

---

### 6. Retail Audit / Visit Form
**Effort:** ~3 hari | **Parity:** Advdotics, Altius ERP  
- Form kunjungan: kondisi display, stok on-hand, foto shelf, catatan kompetitor
- Scoring compliance per kunjungan

**Implementasi:**
- Tabel: `visitReport(visit_log_id, display_score, stok_oh, foto_url, catatan)`, `visitKompetitor(report_id, brand, harga)`

---

### 7. Must Have List (MHL)
**Effort:** ~2 hari | **Parity:** NexSoft ND6  
- Produk wajib per segmen outlet (GT, MT, HoReCa)
- Warning di order entry jika item MHL tidak ada, compliance % dashboard

**Implementasi:**
- Kolom baru di `toko`: `segmen TEXT`
- Tabel: `mustHaveList(segmen, produk_id)`

---

### 8. TPR / Trade Promo
**Effort:** ~4 hari | **Parity:** Simplidots, NexSoft ND6, Advdotics  
- Promo per toko/wilayah: diskon tambahan / bonus item, budget + expiry
- Claim form + rekon budget vs realisasi

**Implementasi:**
- Tabel: `tradePromo`, `promoTarget`, `promoClaim`
- Apply di `pricing.ts` untuk diskon promo on top of existing

---

### 9. Multi-Pricelist (Channel Pricing)
**Effort:** ~2 hari | **Parity:** NexSoft ND6, Altius ERP  
- Harga berbeda per channel: GT, MT, HoReCa
- Lookup priority: harga spesifik toko → harga channel → harga cabang

**Implementasi:**
- Kolom baru di `toko`: `channel TEXT`
- Tabel: `hargaChannel(produk_id, cabang_id, channel, harga)`
- Update `pricing.ts` untuk channel fallback

---

## 🏗️ Tier 3 — Enterprise (5 fitur, relevan jika klien skala Tbk/PKP)

### 10. FEFO / Batch Tracking
**Effort:** ~5 hari | Relevan: distributor makanan/minuman/pharma  
- Lot number + expired date per batch, enforcement FEFO di gudang packing
- Tabel: `batchStok(produk_id, cabang_id, lot_number, expired_date, qty)`

### 11. Demand Forecasting / Reorder
**Effort:** ~1 minggu | Relevan: distributor yang ingin otomasi PO ke principal  
- RPP-based reorder point, alert stok < lead time × RPP
- Scheduled calc dari `kartuStok` history

### 12. e-Faktur / Coretax DJP
**Effort:** ~1 minggu | Relevan: distributor PKP/Tbk  
- PPN 12% otomatis, NPWP validation, format DJP Coretax, export CSV atau API submit

### 13. Multi-Principal
**Effort:** ~1 minggu | Relevan: distributor >1 brand owner  
- Produk tagged per principal, split invoice, akuntansi terpisah per principal

### 14. AI/GenAI Layer
**Effort:** ~2 minggu | Relevan: fase optimasi setelah data cukup  
- Upsell recommendation, churn risk toko, anomali diskon, auto-summary laporan harian
- Stack: Claude API (`claude-haiku-4-5`) untuk inference

---

## 📋 Urutan Implementasi Rekomendasi

### Phase 1 — Tier 1 (~1 sprint, ~1 minggu)
1. AR Aging — value tinggi, query saja
2. Credit Limit Toko — 1 kolom + 1 check di `createOrder`
3. Target Salesman — tabel kecil + query sederhana
4. KPI Dashboard — rollup dari data existing

**Outcome:** Visibility finansial + performa lengkap. ~70% parity vs Simplidots.

### Phase 2 — Tier 2 pilihan (~2 sprint)
5. Multi-Pricelist (extend pricing, minimal perubahan)
6. Must Have List (tabel kecil, warning di order form)
7. Route Plan → Retail Audit (modul field team)
8. TPR / Trade Promo

**Outcome:** Field team tervisibility. ~85% parity vs Simplidots.

### Phase 3 — On-demand
- Tier 3 sesuai kebutuhan klien spesifik (PKP, multi-principal, enterprise scale)

---

## 📞 Catatan Client Onboarding

- **80% distributor FMCG menengah** → Tier 1 + Tier 2 sudah cukup kompetitif
- **Tier 1 bisa selesai 1 sprint** — ideal sebagai pitch demo ke klien baru
- **e-Faktur** hanya wajib jika klien sudah PKP (Pengusaha Kena Pajak)
- **SAP/Oracle** baru relevan di revenue >Rp 500M/bulan atau sudah Tbk
- **AI Layer** efektif setelah data transaksi >6 bulan terkumpul
