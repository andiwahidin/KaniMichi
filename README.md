# KaniMichi — Belajar Kanji & Kosakata Jepang SRS (60 Level)

Aplikasi web pembelajaran radikal, kanji, dan kosakata bahasa Jepang berbasis **Spaced Repetition System (SRS)** dengan struktur penuh **60 Level** (478 Radikal · 2.026 Kanji · 6.584 Kosakata), IME Romaji → Hiragana otomatis, audio pelafalan bahasa Jepang, serta dukungan sinkronisasi cloud menggunakan **Supabase**.

## Fitur Utama
- **Kurikulum 60 Level Penuh**: 6 tahapan (Pleasant, Painful, Death, Hell, Paradise, Reality) dengan 9.088 item yang saling terhubung (*Radikal → Kanji → Kosakata*).
- **Sistem SRS 9 Tahap**: Apprentice I–IV → Guru I–II → Master → Enlightened → Burned dengan penjadwalan interval autentik dan pembukaan level otomatis saat 90% Kanji mencapai Guru.
- **Sesi Pelajaran & Review Harian**: Dilengkapi IME Romaji → Hiragana real-time, deteksi perbedaan On'yomi/Kun'yomi (*shake*), toleransi salah ketik, audio `ja-JP`, Latihan Tambahan (*Extra Study*), dan Mode Libur (*Vacation Mode*).
- **Sinkronisasi Cloud Supabase (Opsional)**: Bekerja otomatis secara lokal (`localStorage`) tanpa konfigurasi, dan langsung mendukung login akun + sinkronisasi lintas perangkat saat environment variable Supabase diatur.

---

## Menjalankan Secara Lokal

```bash
npm install
npm run dev
```

Aplikasi berjalan di `http://localhost:3000`.

---

## Menghubungkan ke Supabase (Gratis)

1. Buat project baru di [Supabase](https://supabase.com).
2. Buka **SQL Editor → New Query**, lalu salin dan jalankan seluruh isi file `supabase/schema.sql`.
   - Skrip ini membuat tabel `public.user_srs_state` dan mengaktifkan **Row Level Security (RLS)** sehingga setiap pengguna hanya bisa membaca dan mengubah progres miliknya sendiri.
3. Buka **Project Settings → API** dan salin:
   - **Project URL**
   - **anon / public key**
4. Salin `.env.example` menjadi `.env.local` (untuk lokal) atau masukkan ke **Environment Variables** pada platform hosting (Vercel / Netlify / Cloudflare Pages):

```env
VITE_SUPABASE_URL="https://PROJECT-REF.supabase.co"
VITE_SUPABASE_ANON_KEY="eyJhbGciOi..."
```

5. Pastikan **Email Auth** aktif di Supabase (**Authentication → Providers → Email**). Opsional: matikan *Confirm email* jika ingin pengguna langsung masuk tanpa verifikasi email saat uji coba.

---

## Deploy Gratis: GitHub Pages + Supabase Saja (Tanpa Vercel)

Aplikasi ini sudah dilengkapi workflow otomatis `.github/workflows/deploy.yml` sehingga kamu cukup memakai **GitHub gratis (repo Public)** + **Supabase gratis**:

1. **Pastikan repositori GitHub bersifat Public** (GitHub Pages gratis untuk repo Public).
2. **Aktifkan GitHub Pages**:
   - Buka repositori GitHub → **Settings** → **Pages**.
   - Di bagian **Build and deployment → Source**, pilih **GitHub Actions**.
3. **Masukkan kredensial Supabase di GitHub Secrets**:
   - Buka **Settings** → **Secrets and variables** → **Actions** → klik **New repository secret**.
   - Tambahkan 2 secret:
     - `VITE_SUPABASE_URL` → isi dengan **Project URL** dari Supabase
     - `VITE_SUPABASE_ANON_KEY` → isi dengan **anon public key** dari Supabase
4. **Jalankan Deploy**:
   - Buka tab **Actions** → pilih workflow **Deploy KaniMichi ke GitHub Pages** → klik **Run workflow** (atau cukup push perubahan baru ke branch `main`).
   - Setelah selesai (~1 menit), alamat website kamu akan tampil langsung di tab Actions & menu Settings → Pages (`https://<username>.github.io/<nama-repo>/`).
5. **Tambahkan URL Website ke Supabase Auth (Opsional untuk verifikasi email)**:
   - Di Supabase → **Authentication → URL Configuration**, isi **Site URL** dengan alamat GitHub Pages kamu.
