# CONTEXT.md — Engineering Action Log

> Wajib: **setiap aksi** (keputusan desain, file dibuat/diubah, perintah dijalankan, bug ditemukan) dicatat di sini
> secara kronologis. AI/engineer berikutnya WAJIB melanjutkan log ini dengan format yang sama.
> Untuk ringkasan arsitektur & cara melanjutkan pekerjaan, baca `HANDOFF.md`.

Format entri: `### [YYYY-MM-DD] #NNN — Judul` lalu bullet: *Aksi*, *Alasan*, *File*, *Hasil*.

---

### [2026-10-20] #001 — Inisialisasi repo
- Aksi: Repo kosong pada branch `claude/exciting-einstein-b58ibb`. Membuat proyek Vite + React 18 secara manual (`package.json`, `vite.config.js`, `index.html`, `.gitignore`).
- Alasan: User meminta sistem React JS tanpa backend dengan mock data. Vite dipilih karena build cepat dan zero-config.
- Dependensi: `react`, `react-dom`, `react-router-dom` (HashRouter agar bisa di-host statis tanpa server rewrite), devDeps `vite`, `@vitejs/plugin-react`. Tidak ada UI library — CSS custom agar ringan & mudah dipahami AI lain.
- Hasil: `npm install` sukses.

### [2026-10-20] #002 — Keputusan arsitektur
- Satu store global (`src/store/AppStore.jsx`) memakai React Context + `useReducer`.
- **Setiap aksi bisnis** didispatch lewat helper `act(type, payload, meta)`; reducer otomatis menambah entri ke `state.activityLog` (audit trail in-app, bisa diexport ke Markdown dari halaman *Activity Log*). Ini memenuhi syarat "setiap aksi disimpan" juga di sisi runtime aplikasi.
- State dipersist ke `localStorage` (key `eo-ms-state-v1`); tombol *Reset demo data* di Settings.
- Entitas "Event" dipakai sebagai *deal* sejak tahap Lead hingga Archived (satu entitas lintas siklus hidup), sehingga CRM pipeline = event dengan stage pra-booking.
- Logika bisnis murni (pricing, pajak, jadwal bayar, pembatalan, hold, lembur, dsb.) dipisah ke `src/lib/*` (pure functions, bisa dites dengan `node --test`).
- Decor Inventory System disimulasikan sebagai "API eksternal" (`src/lib/decorApi.js`) dengan latency & storage terpisah (`eo-decor-inventory-v1`).
- Mock data dibuat relatif terhadap tanggal hari ini agar demo selalu terlihat "hidup".

### [2026-10-20] #003 — Logika bisnis murni (`src/lib`)
- File: `dates.js`, `money.js`, `ids.js`, `pricing.js` (fixed/per_guest/percentage + pajak US/EU/UK/CH + reverse charge), `contracts.js` (jadwal bayar, tabel pembatalan, render template), `lifecycle.js` (12 stage + 3 exit + guard transisi), `availability.js` (kapasitas per weekday, hold berprioritas), `tasks.js` (template T-minus, auto-shift), `staff.js` (lembur CA harian, WTD EU, deteksi bentrok, risiko klasifikasi freelancer), `ros.js` (geser timeline), `decorApi.js` (mock API eksternal), `derived.js` (selector finansial/budget/headcount/leakage/closing), `permissions.js` (RBAC per peran).
- Alasan: memisahkan aturan bisnis dari UI agar bisa dites & dipindah ke backend kelak.

### [2026-10-20] #004 — Mock data (`src/data`)
- `config.js`: company, kurs, 10 yurisdiksi pajak, katalog 26 layanan, 2 jadwal bayar, 2 kebijakan pembatalan, template kontrak, 5 Event Type (konfigurasi segmen social vs corporate: fitur aktif, template tugas/proposal/form), sumber lead, template email, 8 automation, pemetaan akun QuickBooks/Xero, peran.
- `seed.js`: 14 user (8 peran, termasuk client multi-user & vendor), 11 klien, 12 vendor, 10 staf, 14 event yang mencakup semua stage (lead → archived, lost, cancelled), hold bertingkat pada tanggal sama, CO approved/pending/exception, ROS, shift, tamu+meja, incident, reservasi dekor.
- Semua tanggal relatif terhadap hari ini.

### [2026-10-20] #005 — Store & handler aksi (`src/store`)
- `reducer.js`: dispatcher tunggal; clone draft → handler → **append ke `activityLog`** (termasuk aksi yang DITOLAK dengan status `rejected`). Aksi offline diberi `sync: 'pending'` dan masuk `offlineQueue`.
- `handlers/*.js`: system (tick automation, reset, online/offline), crm (lead, hold, stage, postpone, cancel), sales (proposal versi, kontrak, e-sign), finance (invoice, pembayaran → lock tanggal saat deposit, late fee, credit note, gratuity, vendor payable, sync akuntansi), planning, vendors, guests, ops (change order, ROS, insiden, shift, dekor, close-out), settings.
- `AppStore.jsx`: Context, persist localStorage, side-effect async ke Decor API, tick automation tiap 60 detik, listener online/offline.

### [2026-10-20] #006 — Unit/integration test
- `tests/logic.test.js` (+ `tests/setup.js` shim localStorage). Perintah: `npm test`.
- Hasil: 14/14 lulus (pricing, pajak, reverse charge, jadwal bayar, pembatalan, shift task, lembur, ROS, alur lead→deposit lock, promosi hold, CO, CO exception, kapasitas, idempotensi automation).

### [2026-10-20] #007 — UI dasar & layout
- File: `src/styles.css` (design token CSS, layout sidebar, kanban, kalender, seating, phone frame), `src/components/ui.jsx` (Card, Badge, Modal, Tabs, Field, Stat, BarChart, CommitInput, download…), `src/components/Layout.jsx` (sidebar per peran, switch user, notifikasi, toast), `src/components/Availability.jsx`, `src/main.jsx`, `src/App.jsx` (HashRouter + guard per peran).
- Keputusan: `CommitInput` hanya dispatch saat blur/Enter supaya audit log tidak per keystroke.

### [2026-10-20] #008 — Halaman global
- `Dashboard`, `Pipeline` (kanban drag-drop + guard, modal inquiry + cek ketersediaan, lost), `Calendar` (kapasitas, hold, release/extend), `Events`, `Vendors`, `Staff` (+ export .ics), `Finance` (AR/AP/deferred/cash forecast/gratuity/komisi/akuntansi), `Reports` (6 laporan), `Automation` (outbox, workflow, template), `Settings` (kapasitas, kurs, event type features, katalog, pajak, kebijakan, user), `ActivityLog` (filter + export .md).

### [2026-10-20] #009 — Event workspace (15 tab)
- `src/pages/event/*`: Overview (lifecycle bar, guard, edit, hold, approval chain, postpone, cancel + kalkulasi), Proposal (versi, internal/klien, moodboard), Contract (generate, multi-signer e-sign), Planning (tugas, sub-event, form, design, **Decor panel via API**, dokumen, decision log), Vendors (booking, payables, RFQ), Guests (RSVP matrix, headcount, catering report, CSV), Seating (DnD + aturan + export), Budget (kategori, varians, live headcount, multi-payer), Change Orders, Run of Show (+call sheet), Crew, Finance (invoice, pay modal mock Stripe, credit note, gratuity, accounting sync), Messages (+email sync mock), Post-Event (closing, decor return, damage billing, survei, rating), Activity.

### [2026-10-20] #010 — Portal & mobile
- `ClientPortal.jsx` (multi-user dengan izin: view_all, approve_costs, sign, pay, manage_guests, forms, message; payer scope), `VendorPortal.jsx` (COI upload, confirm booking, upload invoice, ROS relevan saja), `DayOf.jsx` (phone frame, status live, geser +5/+15, check-in QR/kode, insiden + foto, call sheet, clock in/out, simulasi offline), `RsvpPublic.jsx` (route `/#/rsvp?event=…` tanpa login).

### [2026-10-20] #011 — Verifikasi
- `npx vite build` sukses. Smoke test Playwright (scratchpad, tidak di-commit) membuka semua route + 15 tab × 8 event + semua tab portal 4 user klien: **0 runtime error**.
- Alur E2E di browser: new inquiry → hold → qualified → proposal → send → accept → contract → e-sign → bayar deposit → 🔒 locked → Planning: **berhasil**, semua aksi muncul di Activity Log.
- Perbaikan dari review visual: `.alert` jadi block (teks terpecah kolom), margin `.card + .card` di grid, seed Carter ditambah jadi 68 household (~135 tamu) agar realistis, toast tidak muncul ulang setelah reload (`lastOk/lastError` tidak dipersist + batas 3 detik), `chunkSizeWarningLimit` 900.
- `npm test`: 14/14 lulus.

### [2026-10-20] #012 — Dokumentasi
- Membuat `HANDOFF.md` (panduan AI berikutnya) dan `README.md`; memperbarui log ini.
