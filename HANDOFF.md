# HANDOFF.md — EO Management System (untuk AI / engineer berikutnya)

> Baca file ini dulu, lalu `CONTEXT.md` (log kronologis setiap aksi engineering).
> **Aturan wajib:** setiap perubahan yang Anda buat HARUS dicatat sebagai entri baru di `CONTEXT.md`
> (format `### [YYYY-MM-DD] #NNN — Judul` + Aksi/Alasan/File/Hasil), dan bagian terkait di file ini diperbarui.

## 1. Ringkasan
Sistem manajemen Event Organizer end-to-end (Lead → Archived) untuk segmen **social** (wedding, birthday, gala pribadi)
dan **corporate** (konferensi, product launch, offsite) di pasar AS & Eropa Barat.
- **Stack:** React 18 + Vite 6 + react-router-dom 6 (HashRouter). Tanpa backend, tanpa UI library. CSS di `src/styles.css`.
- **Data:** mock (`src/data/`), dipersist ke `localStorage` (`eo-ms-state-v1`). Decor Inventory eksternal disimulasikan di key terpisah (`eo-decor-inventory-v1`).
- **Audit:** setiap aksi lewat `act()` → reducer → tercatat di `state.activityLog` (termasuk aksi ditolak & automation). Bisa diexport ke Markdown dari halaman *Activity Log* atau tab *Activity* per event.

## 2. Menjalankan
```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 14 unit/integration test (node --test)
npm run build    # output ke dist/ (bisa di-host statis)
```
Ganti peran/user lewat dropdown **Switch role/user** di topbar (admin, sales, planner, production, finance, crew, 4 user klien dengan hak berbeda, 2 vendor).
*Settings → Reset demo data* mengembalikan seed.

## 3. Arsitektur & alur data
```
UI (pages/*) ──act(type,payload)──► reducer.js ──► handlers/<domain>.js (mutasi draft clone)
     ▲                                   │  ├─ append activityLog (ok / rejected / offline-pending)
     │                                   │  ├─ ctx.notify() → state.notifications
     │                                   │  └─ ctx.sideEffects → state.effects
     └──── useStore() ◄── Context ◄──────┘
AppStore.jsx: persist localStorage · proses effects async ke lib/decorApi.js · SYSTEM_TICK tiap 60s · listener online/offline
Derived data (total, pajak, margin, headcount, leakage, closing) = lib/derived.js — TIDAK disimpan di state.
```
- Handler melempar `BusinessError` (via `assert`) untuk aturan bisnis → state tidak berubah, log `REJECTED`, toast merah.
- Jangan ubah state langsung dari UI. Tambah aksi baru = tambah fungsi di `src/store/handlers/<domain>.js` (otomatis terdaftar lewat spread di `reducer.js`).
- Input yang bisa diketik memakai `CommitInput` (commit saat blur/Enter) agar log tidak banjir per keystroke.

## 4. Peta file
| Path | Isi |
|---|---|
| `src/data/config.js` | Company, kurs, yurisdiksi pajak, katalog layanan, jadwal bayar, kebijakan pembatalan, template kontrak, **Event Types** (konfigurasi segmen), template email, automation, mapping akun QuickBooks/Xero, peran |
| `src/data/seed.js` | `buildSeed()` — user, klien, vendor, staf, 14 event lintas semua stage (relatif hari ini) |
| `src/lib/pricing.js` | Line item fixed / per_guest / percentage, item opsional, pajak US (service fee taxable per yurisdiksi), VAT EU/UK/CH + reverse charge B2B lintas negara |
| `src/lib/contracts.js` | Jadwal bayar dari template, tabel pembatalan, render variabel kontrak |
| `src/lib/lifecycle.js` | 12 stage + 3 exit, `transitionBlockers()` (guard) |
| `src/lib/availability.js` | Kapasitas per weekday, hold berprioritas |
| `src/lib/tasks.js` | Template tugas T-minus, auto-shift saat tanggal berubah |
| `src/lib/staff.js` | Biaya kru, lembur CA harian, WTD EU/UK/CH, bentrok jadwal, risiko klasifikasi freelancer (ABC test) |
| `src/lib/ros.js` | Run of show: sort, geser timeline, filter per vendor/staf |
| `src/lib/decorApi.js` | **Mock API Decor Inventory** (async + latency). Pemetaan endpoint REST ada di komentar header |
| `src/lib/derived.js` | Selector: finansial event, budget per kategori, headcount, guarantee warning, closing checklist, leakage, compliance vendor, payer summary |
| `src/lib/permissions.js` | Nav & capability per peran, `clientCan()` untuk izin multi-user klien |
| `src/lib/exportMd.js` | Export activity log → Markdown |
| `src/store/reducer.js` | Dispatcher + audit log |
| `src/store/handlers/*.js` | `system`, `crm`, `sales` (proposal+kontrak), `finance`, `planning`, `vendors`, `guests`, `ops` (CO, ROS, insiden, shift, dekor, close-out), `settings` |
| `src/pages/*.jsx` | Dashboard, Pipeline, Calendar, Events, Vendors, Staff, Finance, Reports, Automation, Settings, ActivityLog, DayOf, ClientPortal, VendorPortal, RsvpPublic |
| `src/pages/event/*.jsx` | Workspace event: Overview, Proposal, Contract, Planning (+Decor), Vendors, Guests, Seating, Budget, ChangeOrders, RunOfShow, Staff, Finance, Messages, PostEvent, Activity |
| `tests/logic.test.js` | Test logika & alur store |

## 5. Pemetaan spesifikasi → implementasi
| Spec | Di mana |
|---|---|
| 3. Lifecycle + Lost/Cancelled/Postponed; tanggal terkunci hanya setelah deposit | `lifecycle.js`, `crm.js` (`STAGE_CHANGE`, `MARK_LOST`, `EVENT_CANCEL`, `EVENT_POSTPONE`), `finance.js` (`lockDateIfDeposit`) |
| 4.1 CRM: sumber lead, kualifikasi, cek ketersediaan, hold 7 hari + reminder, first/second hold & notifikasi promosi, pipeline + probabilitas, interaksi | `Pipeline.jsx`, `Calendar.jsx`, `Availability.jsx`, `crm.js`, `system.js` (expiry/reminder) |
| 4.2 Proposal: katalog, 3 jenis harga, opsional, versi (1 aktif), pajak per yurisdiksi, internal vs klien, moodboard dari Decor, masa berlaku, multi-currency | `ProposalTab.jsx`, `sales.js`, `pricing.js` |
| 4.3 Kontrak: template variabel, multi-signer e-sign + audit, jadwal bayar otomatis, tabel pembatalan, force majeure, immutable | `ContractTab.jsx`, `sales.js` |
| 4.4 Workspace: sub-event, tugas relatif + dependensi + assign staf/klien/vendor, form klien, design board, dokumen, decision log | `PlanningTab.jsx`, `planning.js` |
| 4.5 Vendor: direktori, COI/lisensi/W-9 + reminder, RFQ & perbandingan, booking, pass-through vs direct, komisi, portal | `Vendors.jsx`, `VendorsTab.jsx`, `VendorPortal.jsx`, `vendors.js` |
| 4.6 Tamu: household, kategori, plus-one, anak, RSVP per sub-event, menu/diet, RSVP publik ber-kode, seating drag-drop + aturan + export, check-in QR, headcount live + guarantee warning | `GuestsTab.jsx`, `SeatingTab.jsx`, `RsvpPublic.jsx`, `DayOf.jsx`, `guests.js`, `derived.js` |
| 4.7 Budget: budget klien vs aktual, cost/sell/margin, sumber otomatis (proposal, vendor, dekor, kru), varians, multi-payer | `BudgetTab.jsx`, `derived.js#budgetByCategory` |
| 4.8 Change Order: dampak biaya/vendor/dekor/timeline, approval portal + audit, update otomatis kontrak/jadwal/budget/dekor, exception setelah deadline headcount | `ChangeOrdersTab.jsx`, `ops.js` (`applyChangeOrder`) |
| 4.9 Run of show: track guest & production, versi draft/shared/final + notifikasi, tampilan per vendor, call sheet, mode hari-H (status live, geser waktu, insiden + foto), offline + sync | `RunOfShowTab.jsx`, `DayOf.jsx`, `ops.js`, `reducer.js` (offline queue) |
| 4.10 Staf: karyawan/freelancer, shift, bentrok, konfirmasi, clock in/out + lokasi, biaya + lembur per wilayah, klasifikasi | `Staff.jsx`, `StaffTab.jsx`, `staff.js` |
| 4.11 Finance: invoice otomatis, bayar (card/ACH/SEPA mock Stripe, tanpa simpan kartu), reminder & late fee, deferred vs recognized, AP vendor, gratuity, refund/credit note, QuickBooks/Xero mapping, FX dikunci per invoice | `Finance.jsx`, `FinanceTab.jsx`, `finance.js`, `system.js` |
| 4.12 Client portal multi-user dengan izin berbeda | `ClientPortal.jsx`, `permissions.js#clientCan`, user `u_client1..4` di seed |
| 4.13 Template & workflow otomatis, sinkron email/kalender (mock + .ics) | `Automation.jsx`, `system.js#SYSTEM_TICK`, `Staff.jsx` (.ics) |
| 4.14 Post-event: checklist penutupan, laporan kerusakan Decor → tagih klien/venue, survei & review, rating vendor, profitabilitas final | `PostEventTab.jsx`, `ops.js` |
| 4.15 Laporan: konversi per sumber, revenue terkontrak per bulan + kas, profitabilitas per event/tipe/planner, utilisasi, kinerja vendor, leakage | `Reports.jsx`, `Finance.jsx`, `Dashboard.jsx` |
| 8. Integrasi Decor Inventory | `decorApi.js`, `DecorPanel.jsx`, efek `decor.*` di `AppStore.jsx` |

## 6. Skenario demo cepat
1. **Admin** → Dashboard: lihat hold kedaluwarsa, invoice overdue, CO exception, peringatan guarantee, COI vendor.
2. **CRM** → *New inquiry* → buka event → *Place hold* → Advance → Proposal *Build* → *Send* → *Record acceptance* → Contract *Generate* → *Send* → e-Sign → Finance *Record payment* deposit → tanggal 🔒 → Advance ke Planning.
3. **Calendar**: tanggal Stellar/Nguyen punya hold #1/#2 → *Release* hold #1 → Nguyen dipromosikan + email di Communication → Outbox.
4. **Carter–Walker Wedding**: Seating (aturan dilanggar sengaja), Budget (multi-payer), Change Orders (CO-102 menunggu), Run of Show → Call sheet.
5. Switch ke **Emily Carter (client)**: approve CO-102, bayar invoice, isi form. Switch ke **Robert Carter**: hanya invoice Catering. **Nina Patel**: hanya tamu.
6. **Acme Summit**: CO-103 exception → klien ditolak sampai admin *Grant exception approval*.
7. **Day-of Mobile** (atau user Jamal/crew): Start/Done/+15 menit, insiden + foto, *simulate offline* → aksi “pending sync” di Activity Log → reconnect.
8. **Harper 50th** (post-event): *Pull return report* dari Decor → tagih kerusakan → rating vendor → survei → Financial close.
9. **Activity Log** → *Export .md*.

## 7. Keputusan & batasan yang disengaja
- Tanpa backend: “email terkirim”, “Stripe”, “QuickBooks/Xero sync”, “e-signature”, “GPS” adalah simulasi; struktur data sudah disiapkan untuk integrasi nyata.
- Aturan pajak & ketenagakerjaan **ilustratif** (bukan nasihat hukum/pajak).
- Kurs statis (Settings). FX dikunci di invoice (`fxRateToUSD`).
- Pendapatan diakui saat stage ≥ `post_event` (atau setelah cancel by client).
- Event = satu entitas sejak Lead (tidak ada entitas Lead terpisah).
- Kapasitas tanggal dihitung dari event booked + hold aktif; hold melebihi slot = waitlist.

## 8. Ide pekerjaan lanjutan
- Backend nyata (mis. Supabase/Postgres) — `handlers/*` bisa dipindah hampir 1:1 menjadi service layer.
- Code-splitting per route (bundle ~550 KB).
- Editor template kontrak & event type yang lebih lengkap (tambah/hapus task template dari UI).
- Seating chart dengan koordinat bebas (floor plan canvas).
- i18n (UI saat ini English; dokumentasi Indonesia).
- Test UI (Playwright) di CI.
