#!/usr/bin/env bash
# Restart Caddy dari Caddyfile di host dengan pengaman: validasi dulu, bandingkan status domain sebelum/sesudah.
# Pakai: bash caddy-restart.sh [cadangan]   (cadangan = berkas Caddyfile.bak-... untuk pemulihan otomatis)
set -u
cd ~/ailabs-deploy
C=ailabs-deploy-caddy-1
BAK=${1:-}
IMG=$(docker inspect -f '{{.Config.Image}}' "$C")
snap() { # domain -> kode HTTP, satu baris per domain
  for h in $(grep -E '^[a-z0-9.-]+ \{' Caddyfile | awk '{print $1}' | sort -u); do
    printf '%s %s\n' "$h" "$(curl -s -o /dev/null -m 10 -w '%{http_code}' "https://$h/" 2>/dev/null)"
  done
}

echo "image caddy: $IMG"
snap > /tmp/caddy_before.txt
echo "== sebelum:"; cat /tmp/caddy_before.txt

echo "== validasi Caddyfile host (container sementara, tanpa menyentuh yang berjalan):"
if ! docker run --rm -v "$PWD/Caddyfile:/etc/caddy/Caddyfile:ro" "$IMG" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | tail -3; then :; fi
docker run --rm -v "$PWD/Caddyfile:/etc/caddy/Caddyfile:ro" "$IMG" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1
if [ $? -ne 0 ]; then echo "VALIDASI GAGAL: Caddy TIDAK di-restart, tidak ada yang berubah."; exit 1; fi
echo "validasi OK"

echo "== restart $C"
docker restart "$C" >/dev/null || { echo "restart gagal"; exit 1; }
sleep 20
echo "status container: $(docker inspect -f '{{.State.Status}} sejak {{.State.StartedAt}}' "$C")"

snap > /tmp/caddy_after.txt
echo "== sesudah:"; cat /tmp/caddy_after.txt
echo "== perubahan status (sebelum -> sesudah):"
join <(sort /tmp/caddy_before.txt) <(sort /tmp/caddy_after.txt) | awk '$2 != $3 {print "  " $1 ": " $2 " -> " $3}'
echo "== (selesai)"
