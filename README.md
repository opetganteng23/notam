# NOTAM AI Generator (satu aplikasi)

`src/` server NestJS · `web/` UI React · `data/` master bandara & contoh dataset · `public/` hasil build UI (disajikan NestJS).

```
npm install
npm run build:all                                 # build UI lalu server
MONGO_URI=... SEED_PASSWORD=... npm run seed      # user originator/ats/pia/nof/admin
MONGO_URI=... JWT_SECRET=... npm start            # UI di /, API di /api
npm test                                          # Jest + e2e (MongoDB in-memory)
npm run dev:web                                   # dev UI (proxy /api ke :3000)
```

LLM: `LLM_PROVIDER=mock` (default), `anthropic` (+ `ANTHROPIC_API_KEY`, `LLM_MODEL`), atau `ollama` (+ `LLM_MODEL`, opsional `OLLAMA_URL`, default `http://localhost:11434`; model lokal, data tidak keluar server).

Waktu: zona bandara diturunkan dari bujur ARP (heuristik WIB/WITA/WIT, bandara dekat batas zona bisa keliru). Jam lokal di input dikonversi ke UTC oleh kode (`src/master/time.ts`) dan dicantumkan di prompt; hanya jam berlabel WIB/WITA/WIT yang dikonversi (jam tanpa label dibiarkan). Sesudah LLM, kode mengoreksi FIR di Q) dan B)/C) dari konversi itu dan mencatat tiap koreksi; validator menolak B)/C) yang tetap tidak sama.

Evaluasi manual ke dataset (butuh LLM sungguhan): `LLM_PROVIDER=ollama LLM_MODEL=qwen3:8b npx ts-node --transpile-only test/eval.ts 30`.

Deploy frontend di Biznet dan backend di PC on-prem: lihat `DEPLOY.md`.

Konfigurasi: salin `.env.example` ke `.env` (dimuat otomatis oleh `npm start` dan `npm run seed`, Node 22.9+).

Validasi D) dan RMK: D) harus memuat rentang jam HHMM-HHMM yang nyata; RMK (di dalam E) tidak boleh kosong. Peringatan bila input menyebut "setiap hari/harian" tetapi D) tidak ada, atau memuat "Catatan" tetapi RMK tidak ada. Diuji ke 927 NOTAM asli: 0 error, 2 peringatan RMK_MISSING.

Pelabelan entitas (draf untuk ditinjau manusia, berbasis aturan, bukan model; mengikuti NOTAM Dataset Labelling Guidelines): `npx ts-node --transpile-only test/label.ts keluaran.jsonl [masukan.json]` (bawaan `data/examples.json`). Entitas: LOCATION, POSITION, REASON, B, C, D, RMK, label Q-code (MR, MX, MN, LP, LC, AS, AK, CC, CS), WIP, dan ILS/VOR/DME/RFFS. Jadwal per hari dalam pekan dan nama bandara huruf kapital semua masih sering meleset; hasilnya wajib diperiksa.

## Role dan fitur

| Role | Fitur |
|---|---|
| ORIGINATOR | Generate, ubah teks, Reuse teks lama (wajib diubah), submit ke ATS atau PIA, riwayat milik sendiri, PDF |
| ATS / PIA / NOF | Review (Accept, Revisi, Reject; catatan wajib untuk Revisi/Reject), daftar, filter, PDF, Excel. NOF Revisi/Reject kembali ke PIA |
| ADMIN | Ringkasan, kontrol server (jeda generate, jam layanan, kuota, model), kelola pengguna (tabel dengan cari, filter, urut, halaman; tambah, ubah, nonaktifkan, hapus), audit log, analytics eksekutif, daftar NOTAM. Tidak dapat generate atau memutuskan |

Semua role melihat dashboard ringkasan (total, dalam review, perlu revisi, ditolak, disetujui; bandara teratas; per bulan) sesuai cakupannya. Role dan status aktif diperiksa ke database di setiap request, jadi akun yang dinonaktifkan atau diubah rolenya langsung berlaku.

## Operasional

- **Health check:** `GET /api/health` mengembalikan 200 bila MongoDB terhubung, 503 bila tidak (untuk NGINX/pemantauan).
- **Login dibatasi:** 5 kegagalan per username+IP mengunci 15 menit (di memori; restart server membukanya). Reset password oleh admin tidak membuka kunci, tunggu atau restart.
- **Batas input:** teks freeform maksimal 3000 karakter (dataset terpanjang 726).
- **Header keamanan dasar** dipasang; HTTPS dan pembatasan akses jaringan dilakukan di NGINX. Ollama tidak punya autentikasi: jangan dibuka ke publik.
- **Dadakan, urutan cepat:** (1) `npm run build:all` (2) isi `.env` (3) `npm run seed` lalu ganti password semua akun lewat tab Pengguna (4) `npm start`, atau `pm2 start dist/main.js --name notam` (5) cek `/api/health` (6) uji satu alur lengkap dengan data contoh.
- **Cadangan:** `mongodump --uri="$MONGO_URI" --out=cadangan-$(date +%F)`; pulihkan dengan `mongorestore`. Lakukan sebelum acara dan setelahnya.
- **LLM mati/lambat:** generate gagal dengan pesan error dan tidak membuat NOTAM palsu. Alur review lain tetap berjalan. Cadangan: pindah `LLM_PROVIDER` ke Ollama di laptop lain lalu restart.
- Belum ada: notifikasi, audit log perubahan pengguna, rate limit selain login, rotasi log.

## Audit log

Tab **Audit Log** (admin) mencatat: login berhasil, gagal, terkunci, dan diblokir; pembuatan, perubahan, dan penghapusan akun (role lama dan baru, aktif/nonaktif, password direset); perubahan pengaturan generate dan muat/bongkar model; serta aksi NOTAM (buat, ubah teks, submit, accept, revisi, reject, lengkap dengan catatan). Password tidak pernah dicatat. Catatan hanya bisa ditambah (tidak ada endpoint ubah atau hapus), dapat difilter (kategori, pelaku, tanggal, kata kunci), dan diunduh sebagai CSV (maksimal 5000 baris, UTC). Retensi tidak dibatasi: pantau ukuran koleksi `auditlogs` dan arsipkan lewat `mongodump` bila perlu.

## Analytics eksekutif

Tab **Analytics** (ADMIN, NOF, PIA, ATS): ringkasan kalimat otomatis, 8 KPI (total, disetujui, ditolak, masih berjalan, tingkat persetujuan, disetujui tanpa revisi, waktu penyelesaian, menunggu > 24 jam, lolos validasi AI), status, funnel persetujuan, tren harian/bulanan, lama tinggal per tahap dan antrean, pengembalian per role, bandara dan kode Q teratas, kualitas AI, dan pengusul. Filter periode (7/30/90 hari, tahun ini, semua, kustom) dan bandara. **Unduh Excel** (7 sheet, termasuk data per pengajuan) dan **Unduh PowerPoint** (10 slide, grafik native yang dapat diedit) memakai angka yang sama dengan layar. Setiap unduhan tercatat di audit log. Perhitungan ada di `src/analytics/analytics.ts` (fungsi murni, diuji). Arti kode Q hanya untuk kode yang dikenali (MR, MX, MN, LP, LC, AS, AK, CC, CS, HW).

## Tampilan

- **Landing page** di `/` (sebelum login): adegan menara ATC dengan animasi (pesawat dan kontrail, lampu landasan berurutan, parabola radar, cincin radar), demo narasi menjadi NOTAM, alur empat tahap, fitur, ringkasan eksekutif, dan layar radar. Menghormati `prefers-reduced-motion` (animasi dimatikan). Login di `/#masuk`.
- **Logo mitra** (AirNav, AILO, Telkom University) di header aplikasi, login, dan landing. Berkas sudah dipotong dan dikecilkan di `web/public/logos`; favicon memakai logo AirNav (`web/public/favicon-*.png`).
- **Layout fluid** (lebar penuh hingga 1720 px), tabel berubah menjadi kartu di layar kecil.
- **Form Buat NOTAM** punya pilihan contoh pesan; detail pengajuan menampilkan pesan asli (kiri) dan draf AI (kanan).
- Gaya landing ada di `web/src/landing.css` dan `web/src/scene.css`; adegan SVG di `web/src/brand.tsx`.

## Laporan jenis NOTAM

Tab **Laporan Jenis** (ADMIN, NOF, PIA, ATS) mengelompokkan NOTAM menurut kode Q hasil susunan terakhir: kelompok (huruf pertama setelah Q), subjek (dua huruf), dan kondisi (dua huruf terakhir). Isinya: ringkasan kalimat, kelompok dan kondisi terbanyak, rincian bertingkat yang dapat dibuka, tren per hari atau bulan menurut kelompok, matriks bandara × kelompok, dan daftar NOTAM per jenis (klik untuk melihat NOTAM lengkap dan pesan aslinya). Filter: periode, bandara, status. **Unduh Excel** (5 sheet; sheet Data memuat NOTAM lengkap dan pesan asli) dan **Unduh PowerPoint** (7 slide). Hitungan ada di `src/analytics/types.ts` (fungsi murni, diuji).

Batasan: kode Q berasal dari susunan AI (kecocokan dengan NOTAM asli sekitar 61%) dan belum dikoreksi peninjau. Arti subjek dan kondisi hanya untuk kode yang terverifikasi (MR, MX, MN, LP, OB; LC, AS, AK, CC, CS, HW, XX); kelompok bernama menurut pengelompokan kode Q ICAO. Kode lain tampil apa adanya sampai tabel resmi AirNav tersedia.

## Antarmuka

- **Sidebar** menempel di tepi kiri (kelompok Pantau dan Kelola untuk admin); di layar kecil menjadi baris menu yang dapat digeser.
- **Pemberitahuan (toast)** untuk setiap aksi yang mengubah data atau mengunduh (masuk, keluar, buat NOTAM, submit, keputusan, pengguna, pengaturan server, unduhan) dan setiap galat. Terpusat di `web/src/api.ts` (`describe`). Pemberitahuan sesi berakhir bertahan melewati muat ulang.
- **Lama generate** ditampilkan: pewaktu hidup saat proses berjalan, lama model di detail NOTAM, dan di pemberitahuan setelah selesai.
- **Tampilan NOF** mengikuti MoM: Nomor Request NOTAM, Tanggal Pengusulan (PIA), Pengusul (PIA), tanpa kolom prompt.

## Menyalakan di PC on-prem

Klik dua kali dari folder `NOTAM`:

| File | Fungsi |
|---|---|
| `Nyalakan-NOTAM.bat` | Menyalakan Ollama, database, backend, dan tunnel ke VPS (komponen yang sudah hidup dilewati), lalu menampilkan status |
| `Status-NOTAM.bat` | Memeriksa kelima komponen dan situs publik, hanya membaca |
| `Matikan-NOTAM.bat` | Mematikan backend, tunnel, dan database (Ollama dibiarkan) |

Skripnya ada di `deploy/windows`. Kunci SSH dibaca dari `..\medisiana.pem` atau variabel `NOTAM_SSH_KEY`. **Mulai otomatis saat login Windows:** `powershell -ExecutionPolicy Bypass -File deploy\windows\install-autostart.ps1 -KeyPath C:\jalur\kunci.pem` (batalkan dengan `uninstall-autostart.ps1`). Tombol di web tidak dapat menyalakan backend yang mati, karena web dilayani dari VPS dan yang mati adalah PC-nya.

## Arti Q-code

`qcode-arti-dari-contoh-dataset.csv` (di folder `NOTAM`) memuat arti subjek dan kondisi yang **disimpulkan dari contoh item E** di dataset (111 dari 118 kode; mencakup 99% NOTAM dataset). Kamusnya ada di `src/analytics/types.ts` (`SUBJECT_NAME`, `CONDITION_NAME`). Ini bukan tabel resmi AirNav; semua baris bertanda "perlu divalidasi". Kode yang contohnya kurang tegas dibiarkan tanpa arti.
