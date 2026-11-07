# Memasang NOTAM AI baru di server Notam AI (Docker), berdampingan dengan sistem lama

Prinsip: sistem lama (aplikasi dan MySQL) **tidak disentuh**. Sistem baru memakai container, network (`notam_ai_net`),
volume (`notam_ai_mongo`), dan port sendiri. Yang berubah di sisi AirNav hanya tujuan nginx (port), dan bisa dikembalikan kapan saja.

Arsitektur: `notam-ai-app` (backend + frontend, satu proses, port 3300 di dalam container) dan `notam-ai-mongo` (database baru,
tanpa port ke luar). LLM ada di server GPU (`notam-ft-ollama`, `http://10.168.219.3:11436`).

## 0. Cek sebelum mulai (hanya membaca)
```
sudo docker ps --format "table {{.Names}}\t{{.Ports}}\t{{.Status}}" > ~/docker-sebelum.txt; cat ~/docker-sebelum.txt
sudo ss -tlnp | grep -E ":8080\b" || echo "port 8080 bebas"
nc -vz -w 5 10.168.219.3 11436        # server ini harus bisa menjangkau Ollama di server GPU
```
Bila port 8080 terpakai, pilih port lain dan isi `NOTAM_PORT` di `.env`. Bila `nc` gagal, minta AirNav membuka rute 172.20.9.8 → 10.168.219.3:11436.

## 1. Taruh kode di server
Frontend dibuild di PC (`npm run build:web`, hasilnya folder `public/`) lalu dikirim terpisah ke akar kode di server (`~/notam-ai/public`), karena CPU server tidak mendukung vite.
Salah satu: `git clone` repo (bila server bisa ke GitHub), atau dari PC: `scp -r` folder `app` tanpa `node_modules`, `dist`, `public`, `.env`, `finetune`.
Semua perintah berikut dijalankan dari folder `app/deploy/docker`.

## 1b. Siapkan tunnel SSH ke server GPU (server ini belum punya rute langsung ke Ollama)
Di server Notam AI, dari folder `app/deploy/docker`:
```
mkdir -p secrets && chmod 700 secrets
ssh-keygen -t ed25519 -N "" -C notam-ai-tunnel -f secrets/tunnel_key
cat secrets/tunnel_key.pub            # salin satu baris ini
ssh-keyscan -p 5617 103.67.43.166 > secrets/known_hosts
ssh-keygen -lf secrets/known_hosts    # fingerprint harus SHA256:AgqXa5eBPhrUbR5c/QfJGQUyb9Akr7a/0KW7yi0us8A
```
Di server GPU (akun `ubuntu`), tambahkan kunci publik tadi **dengan pembatasan** sehingga kunci itu hanya bisa meneruskan satu port:
```
echo 'restrict,port-forwarding,permitopen="10.168.219.3:11436" ssh-ed25519 AAAA...isi_kunci_publik... notam-ai-tunnel' >> ~/.ssh/authorized_keys
```
Kunci privat `secrets/tunnel_key` tidak boleh dikirim ke chat atau di-commit.

## 2. Isi konfigurasi
```
cp .env.example .env
openssl rand -hex 32          # hasilnya isikan ke JWT_SECRET di .env
nano .env
```
Jangan memakai JWT_SECRET atau password dari sistem lain, dan jangan di-commit.

## 3. Bangun dan jalankan
```
sudo docker compose build
sudo docker compose up -d
sudo docker compose ps         # notam-ai-app dan notam-ai-mongo harus "healthy"
curl -s http://127.0.0.1:8080/api/health
```
Bila `notam-ai-mongo` gagal start (CPU tanpa AVX), isi `MONGO_IMAGE=mongo:4.4` di `.env`, lalu `sudo docker compose up -d` lagi.

## 4. Buat akun
Akun admin pertama (ganti nilai; riwayat shell menyimpan perintah ini):
```
sudo docker exec -e NEW_USERNAME=admin -e NEW_PASSWORD='GANTI_INI' notam-ai-app node dist/create-user.js
```
Atau akun per peran (originator, ats, pia, nof, admin) dengan satu password awal, lalu ganti lewat tab Pengguna:
```
sudo docker exec -e SEED_PASSWORD='GANTI_INI' notam-ai-app node dist/seed.js
```
Opsional, arsip NOTAM dari dataset: `sudo docker exec notam-ai-app node dist/import-dataset.js`.

## 5. Uji sebelum domain dialihkan
Dari jaringan internal/VPN buka `http://172.20.9.8:8080`, login, lalu satu alur lengkap: tulis teks, Generate, validasi, simpan.
Di server GPU saat Generate: `sudo docker exec notam-ft-ollama ollama ps` harus menampilkan `notam-ft`.

## 6. Pengalihan domain (dikerjakan AirNav)
Cukup ubah tujuan proxy di nginx dari aplikasi lama ke port baru, contoh:
```
location / {
    proxy_pass http://172.20.9.8:8080;      # sebelumnya: tujuan sistem lama
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
}
```
Lalu reload nginx. Sistem lama tetap berjalan; untuk kembali, kembalikan tujuan proxy ke yang lama lalu reload.

## 7. Cek sistem lama tidak berubah
```
sudo docker ps --format "table {{.Names}}\t{{.Ports}}\t{{.Status}}"   # bandingkan dengan ~/docker-sebelum.txt
```
Semua container lama harus tetap Up dengan umur yang sama; yang bertambah hanya `notam-ai-app` dan `notam-ai-mongo`.

## Memperbarui, menghentikan, menghapus
- Perbarui kode: ambil kode baru, lalu `sudo docker compose build && sudo docker compose up -d` (data aman di volume).
- Hentikan sementara: `sudo docker compose stop`; nyalakan lagi: `sudo docker compose start`.
- `sudo docker compose down` menghapus container saja, data tetap. **`down -v` menghapus data database baru**; jangan dipakai kecuali memang ingin mengosongkan.
- Backup: `sudo docker exec notam-ai-mongo mongodump --archive --db notam > notam-$(date +%F).archive`.

## Catatan
- Berkas ini belum diuji dengan Docker sungguhan (tidak ada Docker di lingkungan penyusunnya); build pertama di server yang membuktikannya.
- Tidak ada perintah di sini yang mengubah, menghentikan, atau menghapus container, network, volume, atau folder `~/projects` dan `~/web` milik sistem lama.
