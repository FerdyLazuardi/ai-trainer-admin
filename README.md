# Amartha CAG Admin Portal (Spreadsheet Ingestion & Cron Manager)

Admin Portal mandiri untuk mengelola sinkronisasi data Google Spreadsheet (Point, Area, Regional, Pulau, & Metrik KPI) dan penjadwalan otomatis (Cron) untuk AI Trainer Amartha CAG.

Dirancang untuk dideploy ke **Cloudflare Pages** dengan proteksi keamanan **Cloudflare Zero Trust (Access)**.

---

## Fitur Utama

1. **Sinkronisasi Manual (1-Klik)**:
   - Tombol trigger sinkronisasi instan ke background worker.
   - Indikator visual real-time dengan polling otomatis (tanpa reload halaman).
   - Menampilkan total pengguna & cabang yang berhasil diperbarui.

2. **Pengaturan Otomasi Jadwal (Cron)**:
   - Toggle Aktifkan / Nonaktifkan auto-sync.
   - Pilihan frekuensi: **Harian (Daily)** atau **Mingguan (Weekly - Pilih Hari)**.
   - Pilihan jam eksekusi dalam zona waktu **WIB**.
   - Tersimpan aman di Redis backend.

3. **Status & Riwayat Terakhir**:
   - Menampilkan waktu sinkronisasi terakhir, status eksekusi (Sukses/Gagal), dan ringkasan data.

4. **Keamanan Maksimal**:
   - Server-side API proxy: Kredensial `ADMIN_API_KEY` tidak pernah terekspos ke browser client.
   - Terintegrasi dengan Cloudflare Zero Trust Access (membaca email admin dari header `Cf-Access-Authenticated-User-Email`).

---

## Development Lokal

1. Masuk ke folder project:
   ```bash
   cd cag-admin
   ```

2. Buat file `.env` dari `.env.example`:
   ```bash
   copy .env.example .env
   ```
   Sesuaikan `BACKEND_API_URL` dan `ADMIN_API_KEY`.

3. Jalankan server development:
   ```bash
   npm run dev
   ```
   Buka [http://localhost:4321](http://localhost:4321) di browser.

4. Build untuk verifikasi:
   ```bash
   npm run build
   ```

---

## Panduan Deployment ke Cloudflare Pages

1. **Push ke GitHub**:
   Inisialisasi git dan push folder ini ke repository GitHub baru (misal: `cag-admin`).

2. **Buat Project di Cloudflare**:
   - Buka [dash.cloudflare.com](https://dash.cloudflare.com/) -> pilih menu **Workers & Pages**.
   - Klik **Create application** -> pilih tab **Pages** -> **Connect to Git**.
   - Pilih repository GitHub `cag-admin`.

3. **Konfigurasi Build**:
   - **Framework preset**: `Astro`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`

4. **Environment Variables**:
   Di bagian *Environment variables (advanced)*, tambahkan:
   - `BACKEND_API_URL` = `https://ai-trainer.lifeatamartha.com/api/v1` (URL FastAPI di Proxmox)
   - `ADMIN_API_KEY` = `<ADMIN_API_KEY_KAMU>`

5. **Pasang Custom Domain & Cloudflare Zero Trust**:
   - Di project Pages, tambahkan Custom Domain (misal `admin.domainlu.com`).
   - Masuk ke **Cloudflare Zero Trust** -> **Access** -> **Applications**.
   - Buat Application baru untuk domain `admin.domainlu.com`.
   - Buat Policy:
     - **Action**: `Allow`
     - **Rule configuration**:
       - Selector: `Emails ending in`
       - Value: `@amartha.com`
