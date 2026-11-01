#!/bin/sh
# Memperbarui tampilan (frontend) di VPS dari git: pull, build, lalu salin ke /var/www/notam.
# Backend tidak berjalan di VPS (ada di PC on-prem lewat tunnel), jadi tidak ada pm2 untuk NOTAM.
#   sh ~/apps/notam/deploy/vps/deploy-web.sh
set -e
cd "$(dirname "$0")/../.."
git pull --ff-only
npm ci --no-audit --no-fund
npm run build:web
rsync -a --delete public/ /var/www/notam/ 2>/dev/null || { rm -rf /var/www/notam/* && cp -a public/. /var/www/notam/; }
echo "Frontend terpasang: $(git rev-parse --short HEAD)"
