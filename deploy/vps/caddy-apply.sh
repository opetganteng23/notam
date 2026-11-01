#!/usr/bin/env bash
# Menerapkan Caddyfile di host ke Caddy yang berjalan TANPA restart: salin ke container, validasi di sana
# (volume /data asli, mis. sertifikat manual), lalu reload. Bila tidak valid, Caddy tidak berubah.
# Juga membandingkan status HTTP semua domain sebelum dan sesudah.
set -u
cd ~/ailabs-deploy
C=ailabs-deploy-caddy-1
TMP=/tmp/Caddyfile.apply
snap() {
  for h in $(grep -E '^[a-z0-9.-]+ \{' Caddyfile | awk '{print $1}' | sort -u); do
    printf '%s %s\n' "$h" "$(curl -s -o /dev/null -m 10 -w '%{http_code}' "https://$h/" 2>/dev/null)"
  done
}

snap > /tmp/caddy_before.txt
echo "== sebelum:"; cat /tmp/caddy_before.txt

docker cp Caddyfile "$C:$TMP" || { echo "gagal menyalin"; exit 1; }
echo "== validasi di dalam container:"
docker exec "$C" caddy validate --config "$TMP" --adapter caddyfile >/tmp/caddy_validate.log 2>&1
if [ $? -ne 0 ]; then tail -4 /tmp/caddy_validate.log; echo "VALIDASI GAGAL: tidak ada yang diubah."; exit 1; fi
echo "validasi OK"

echo "== reload"
docker exec "$C" caddy reload --config "$TMP" --adapter caddyfile >/tmp/caddy_reload.log 2>&1
if [ $? -ne 0 ]; then tail -4 /tmp/caddy_reload.log; echo "RELOAD GAGAL: Caddy tetap memakai konfigurasi sebelumnya."; exit 1; fi
echo "reload OK (container tidak di-restart: $(docker inspect -f '{{.State.StartedAt}}' "$C"))"
sleep 25

snap > /tmp/caddy_after.txt
echo "== sesudah:"; cat /tmp/caddy_after.txt
echo "== perubahan status (sebelum -> sesudah):"
join <(sort /tmp/caddy_before.txt) <(sort /tmp/caddy_after.txt) | awk '$2 != $3 {print "  " $1 ": " $2 " -> " $3; n++} END {if (!n) print "  (tidak ada perubahan pada domain lain)"}'
