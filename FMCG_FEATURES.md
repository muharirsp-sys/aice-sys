# FMCG Feature Roadmap — Aice-Sys3

**Berdasarkan riset:** Top-tier FMCG apps (Simplidots, NexSoft ND6, Accurate Online, Altius ERP, Advdotics, Odoo FMCG)  
**Status:** Ready for implementation on client request  
**Last Updated:** 2026-06-11

---

## 📊 Feature Gap Analysis

### ✅ Sudah Ada (Core)

| Fitur | Status | Detail |
|-------|--------|--------|
| Taking Order | ✅ Complete | Standard + Kanvas luar kota |
| Approval Workflow | ✅ Complete | Admin fakturist approve/reject |
| Gudang Packing | ✅ Complete | Confirm ready-to-ship |
| Delivery + GPS/Foto | ✅ Complete | Proof of delivery |
| Incaso / Payment | ✅ Complete | Bukti bayar + metode |
| Daily Closing | ✅ Complete | Per-role sign-off + lock |
| Audit Trail | ✅ Complete | Full action log per user |
| Multi-Cabang | ✅ Complete | Harga & diskon per cabang |
| PDF Faktur + WA Share | ✅ Complete | Public token invoice |
| PWA Offline | ✅ Complete | Installable, service worker |
| Sales Context Toko | ✅ Complete | Riwayat + top produk |
| Diskon per Toko | ✅ Complete | Anti-fraud discount caps |

---

## ⚡ Tier 1 — Quick Win (Priority Implementation)

Scope: **5 fitur, ~9 hari kerja**

### 1. KPI Dashboard
**Impact:** High — Visibility performa, standar di Simplidots/ND6  
**Effort:** 2 hari  
**Description:** 
- RPP (Rencana Penjualan Pabrik) vs Actual per salesman/cabang
- Hit rate: % toko yang order
- Omset per salesman per periode
- Top 10 toko by value
- Productivity by cabang

**Data Model:**
- New table: `kpiTarget` (salesman_id, period, target_rpp)
- Queries: daily/weekly rollup dari `order` + `orderItem`

---

### 2. Stok Gudang Real-time
**Impact:** High — Foundation untuk retur, FEFO, reorder suggest  
**Effort:** 3 hari  
**Description:**
- Opening stok → +in (GRN) → -out (delivery) → +return → closing  
- Min-stock alert per produk per cabang
- Stock card per produk/cabang dengan history
- Live inventory in `/gudang` page

**Data Model:**
- New table: `inventory` (cabang_id, produk_id, qty_on_hand, last_update)
- New table: `inventoryMovement` (id, cabang_id, produk_id, movement_type, qty, ref_order_id, created_at)
- Automate: insert into `inventoryMovement` on order confirm, delivery, return

---

### 3. Target Salesman
**Impact:** Medium — Motivasi sales, tracking progress  
**Effort:** 1 hari  
**Description:**
- Monthly target omset per user
- Progress bar: actual vs target, % achievement
- Period: bulan, seminggu, per-order-day
- Simple table di `/sales` dashboard

**Data Model:**
- New table: `salesmantarget` (user_id, period_month, target_amount)
- Query: sum(`order.total`) WHERE user_id = ? AND month = ?

---

### 4. Retur / BS-Dented (Return Order)
**Impact:** High — Kontrol quality, inventory, piutang  
**Effort:** 2 hari  
**Description:**
- Return order form: select dari delivered orders
- Reason: expired, BS, dented, salah item, dllnya
- Qty returned vs delivery, harga restitusi
- Impact on inventory: +stok, -piutang
- Audit trail: return date, approval, finance post

**Data Model:**
- New table: `returnOrder` (id, original_order_id, return_date, user_id, status)
- New table: `returnItem` (id, return_order_id, produk_id, qty, reason, harga_restitusi)
- Workflow: approved → ready_to_receive → received (confirm qty) → finance_closed

---

### 5. Credit Limit Toko
**Impact:** Medium — Kontrol piutang, cegah order berlebih  
**Effort:** 1 hari  
**Description:**
- Batas piutang maksimal per toko (rupiah)
- Warning di order entry: soft limit (warning), hard limit (reject)
- Current piutang calculated dari invoice - payment
- Simple toggle: approve over-limit (approval_flag)

**Data Model:**
- New column in `toko`: `credit_limit` (integer)
- Query at order entry: sum piutang terbuka vs limit

---

## 🔧 Tier 2 — Medium Complexity

Scope: **6 fitur, ~17 hari kerja**

### 6. Route Plan / Visit Schedule
**Effort:** 4 hari  
**Description:**
- Jadwal kunjungan salesman per toko (manual atau otomatis by wilayah)
- Check-in/check-out GPS saat kunjungan
- Track: planned visit vs aktual
- Performance metric: % visit plan achievement

**Implementation:** New module `/sales/routes`, visit checkin form

---

### 7. Retail Audit / Visit Report
**Effort:** 3 hari  
**Description:**
- Form kunjungan toko: display, stok OH, foto, kompetitor
- Scoring: compliance %
- Attachment: foto shelf, toko, kompetitor
- Timeline view di order detail

**Implementation:** New component `visit-report-form`, new table `visitReport`

---

### 8. Must Have List (MHL)
**Effort:** 2 hari  
**Description:**
- Master: produk wajib per segment outlet (GT, MT, MT+, HoReCa)
- Check di order entry: wajib ada item tertentu
- Dashboard compliance %

**Implementation:** New table `mhlList`, validation di order pricing

---

### 9. TPR / Trade Promo
**Effort:** 4 hari  
**Description:**
- Promo per toko/wilayah dengan budget & expiry
- Claim form: attachment, approval
- Impact harga di order entry
- Rekon budget vs claim

**Implementation:** New table `tradePromo`, promo claim flow

---

### 10. Multi-Pricelist
**Effort:** 2 hari  
**Description:**
- Channel pricing: GT (general trade), MT (modern trade), HoReCa, etc
- Price lookup: toko channel → harga baru
- Override: per toko pricelist

**Implementation:** New column in `toko.channel`, modify pricing.ts logic

---

### 11. AR Aging
**Effort:** 2 hari  
**Description:**
- Piutang per toko: 0-30, 31-60, 61-90, 90+ hari
- Dashboard: total outstanding, aging bucket
- Collection dashboard per incaso/cabang

**Implementation:** Query report, new page `/reporting/ar-aging`

---

## 🏗️ Tier 3 — Enterprise Features

Scope: **6 fitur, ~5-6 minggu kerja**

### 12. FEFO / Batch Tracking
**Effort:** 5 hari  
**Description:**
- Lot number + expired date per stok
- Enforcement di gudang packing: FEFO picks
- Alert before expiry (warehouse, toko)

**Implementation:** Inventory tracking by batch, warehouse optimization

---

### 13. Demand Forecasting
**Effort:** 1 minggu  
**Description:**
- RPP-based reorder suggestion
- Seasonality learning
- Low-stock alert → auto-PO draft

**Implementation:** ML model (external or simple moving average), reorder table

---

### 14. e-Faktur / Coretax DJP
**Effort:** 1 minggu  
**Description:**
- PPN otomatis based on item
- Compliance: NPWP validation
- Submit ke DJP Coretax API
- Approval workflow: draft → signed → submitted

**Implementation:** Tax service integration, digital signing

---

### 15. Multi-Principal
**Effort:** 1 minggu  
**Description:**
- Support multi brand owner per salesman
- Split invoice per principal
- Separate accounting per principal

**Implementation:** New entities, financial isolation

---

### 16. Financial Reports
**Effort:** 1 minggu  
**Description:**
- P&L per cabang, neraca, arus kas operasional
- Budget variance
- Monthly closing accounting

**Implementation:** Reporting module, GL integration (optional SAP/NetSuite)

---

### 17. AI/GenAI Layer (Future)
**Effort:** 2 minggu  
**Description:**
- Analisa performa toko (churn risk, growth potential)
- Upsell recommendation (bundle, sister product)
- Anomali detection: unusual discount, fraud pattern
- Auto-summary: daily sales report, top issue

**Implementation:** Claude API integration, feature store

---

## 📋 Implementation Strategy

### Phase 1: Stabilize Core + Tier 1 (Weeks 1-2)
1. Stok Gudang
2. KPI Dashboard
3. Target Salesman
4. Retur / BS-Dented
5. Credit Limit

**Outcome:** MVP parity dengan Simplidots dasar

### Phase 2: Add SFA Capability (Weeks 3-4)
6. Route Plan
7. Retail Audit
8. Must Have List

**Outcome:** Field sales now visible + auditable

### Phase 3: Financial Control (Week 5)
9. TPR / Promo
10. Multi-Pricelist
11. AR Aging

**Outcome:** Revenue + piutang control

### Phase 4: Enterprise (6+ weeks)
12-17. Batch tracking, forecasting, tax, multi-principal, reports, AI

---

## 🎯 Success Criteria

**Core (sudah ada):** Distributor bisa order, approve, pack, ship, bayar, audit  
**Tier 1:** Distributor bisa track stok, target, piutang, return  
**Tier 2:** Field team tervisibility, retail compliance  
**Tier 3:** Enterprise-grade accounting, compliance, forecasting

---

## 📞 Client Onboarding Notes

- Mulai dengan **Tier 1** untuk perceived value immediate
- Stok Gudang paling urgent (everything else depends on it)
- Credit limit paling simple, bisa quick win confidence builder
- Retur penting untuk trust (toko bisa return BS/expiry)
- KPI dashboard penting untuk management buy-in

---

## 🔗 Related Documents

- `SYSTEM_MAP.md` — Architecture & codebase
- `DEPLOY-DETAIL.md` — Deployment, scaling
- `prd.md` — Product requirements (if exists)
