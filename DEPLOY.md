# Deploy: frontend di VPS Biznet, backend + database + LLM di PC on-prem

```
Browser ──HTTPS──> Caddy (VPS, :443)  notam.ailabs.or.id
                     └─> nginx (VPS, 172.19.0.1:13301, hanya jaringan Docker)
                           ├─ /      file statis UI  (/var/www/notam)
                           └─ /api/  ──> 127.0.0.1:13300 (VPS)
                                             ▲  tunnel balik SSH (PC yang memulai)
PC on-prem:  backend :3300 (127.0.0.1) ◄─────┘
             MongoDB :27017 (127.0.0.1)    Ollama :11434 (lokal, tidak dibuka)
```

PC tidak dibuka ke internet: PC yang menyambung keluar ke VPS (`ssh -R`). Port 13300 di VPS hanya di loopback. Bila PC mati atau tunnel putus, `/api` menjawab 502 dan UI menampilkan "Server on-prem tidak dapat dihubungi".

## 1. PC on-prem (sudah disiapkan)

- Data di `C:\Users\<nama>\notam-data` (database `db/`, `bin/mongod.exe`, `logs/`). `.env` di folder `app` (`MONGO_URI=mongodb://127.0.0.1:27017/notam`, `PORT=3300`, `HOST=127.0.0.1`, `LLM_PROVIDER=ollama`, `LLM_MODEL=qwen3:8b`).
- Menjalankan semuanya (idempoten): `powershell -ExecutionPolicy Bypass -File deploy\windows\start-all.ps1 -KeyPath C:\jalur\kunci.pem` (atau set `NOTAM_SSH_KEY`). Menghentikan: `deploy\windows\stop-all.ps1` (`-KeepDb` untuk membiarkan database).
- Akun admin pertama: `NEW_USERNAME=... NEW_PASSWORD=... npm run create-user`. Setelah itu kelola akun lewat tab Pengguna.
- Agar hidup sendiri setelah PC menyala: daftarkan `start-all.ps1` sebagai Scheduled Task "At log on" (atau NSSM). Atur Windows agar tidak Sleep, dan BIOS "Restore on AC power loss: Power On".

## 2. VPS (sudah terpasang kecuali Caddy)

- Statis UI: `/var/www/notam` (salinan folder `public/` hasil `npm run build:web`). Perbarui: unggah `public/` ke `~/notam-staging/public/` lalu `rsync -a --delete ~/notam-staging/public/ /var/www/notam/`.
- nginx: `deploy/vps/nginx-notam.conf` → `/etc/nginx/sites-available/notam` (di-symlink ke `sites-enabled`), mendengarkan `172.19.0.1:13301`. Berisi batas login 10/menit dan timeout generate 220 detik.
- **Caddy** memegang port 80/443 untuk semua domain. Blok yang perlu ada (sudah ditambahkan ke `~/ailabs-deploy/Caddyfile`, cadangan `Caddyfile.bak-20261101103618`):
  ```
  notam.ailabs.or.id {
      encode zstd gzip
      reverse_proxy 172.19.0.1:13301
  }
  ```
  **Aktif** sejak 1 November 2026, diterapkan tanpa restart dengan `deploy/vps/caddy-apply.sh` (salin Caddyfile host ke container, validasi dengan volume `/data` asli, lalu `caddy reload`; bila tidak valid Caddy tidak berubah; membandingkan status semua domain sebelum dan sesudah). Catatan: berkas Caddyfile yang terpasang ke container berasal dari inode lama dan tidak identik dengan berkas di host, jadi `caddy reload --config /etc/caddy/Caddyfile` memuat versi usang dan gagal; selalu pakai `caddy-apply.sh` untuk perubahan berikutnya.

## 3. Verifikasi setelah semuanya aktif

```
curl https://notam.ailabs.or.id/api/health      # {"status":"ok","db":"terhubung","llm":"ollama"}
```
Login di `https://notam.ailabs.or.id`, buka tab Server (status database, LLM terjangkau), lalu satu alur lengkap.

## 4. Mengendalikan pemakaian (tab **Server**, khusus admin)

| Kontrol | Fungsi |
|---|---|
| Jeda / Buka generate | Menghentikan pembuatan NOTAM baru seketika dengan pesan untuk pengguna, dan membongkar model dari GPU (GPU siaga). Buka memuat model kembali. Review, daftar, dan unduhan tetap jalan. |
| Jam layanan | mis. `08:00-17:00` (jam PC); boleh melewati tengah malam. |
| Batas per pengguna per hari | Mencegah pemakaian terus-menerus; 0 = tanpa batas. |
| Muat / Bongkar model | Warm-up sebelum acara; bongkar untuk membebaskan GPU/RAM. |
| Status | Database, LLM, model termuat, antrean, uptime, memori PC, pemakaian per pengguna. |

## 5. Yang perlu diketahui

- Server tidak dapat menyalakan PC yang mati (butuh smart plug atau Wake-on-LAN).
- Data pengajuan ada di PC. Cadangkan folder `notam-data\db` atau gunakan `mongodump` sebelum dan sesudah acara.
- Di balik tunnel, backend melihat semua koneksi dari 127.0.0.1, sehingga kunci login backend (5 gagal per username) berlaku per username; pembatas per IP ada di nginx.
