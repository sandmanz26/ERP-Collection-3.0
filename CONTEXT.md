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
