# Menjalankan seluruh komponen NOTAM di PC on-prem: database, backend, dan tunnel ke VPS.
# Aman dijalankan berulang: komponen yang sudah hidup dilewati.
#   powershell -ExecutionPolicy Bypass -File deploy\windows\start-all.ps1 -KeyPath C:\jalur\kunci.pem
param(
  [string]$KeyPath = $env:NOTAM_SSH_KEY,
  [string]$VpsHost = 'ailolabs@103.93.132.251',
  [int]$RemotePort = 13300,
  [int]$LocalPort = 3300,
  [string]$DataRoot = "$env:USERPROFILE\notam-data"
)
$ErrorActionPreference = 'Stop'
$app = Resolve-Path "$PSScriptRoot\..\.."
New-Item -ItemType Directory -Force "$DataRoot\db", "$DataRoot\bin", "$DataRoot\logs" | Out-Null
$listening = { param($p) [bool](Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) }

# 0. LLM (Ollama): dijalankan bila belum hidup. Tanpa ini NOTAM tidak dapat disusun.
if (-not (& $listening 11434)) {
  $ollama = Get-Command ollama -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source
  if (-not $ollama -and (Test-Path "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe")) { $ollama = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" }
  if ($ollama) { Start-Process $ollama -ArgumentList 'serve' -WindowStyle Hidden; Start-Sleep 6 }
}
"llm      : " + $(if (& $listening 11434) { 'hidup (Ollama, 127.0.0.1:11434)' } else { 'TIDAK HIDUP: pasang/jalankan Ollama' })

# 1. Database (mongod portabel; salin dari cache mongodb-memory-server bila belum ada)
if (-not (Test-Path "$DataRoot\bin\mongod.exe")) {
  $cache = Get-ChildItem "$env:USERPROFILE\.cache\mongodb-binaries\mongod-*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $cache) { throw "mongod.exe tidak ditemukan. Pasang MongoDB atau letakkan mongod.exe di $DataRoot\bin" }
  Copy-Item $cache.FullName "$DataRoot\bin\mongod.exe"
}
if (-not (& $listening 27017)) {
  Start-Process "$DataRoot\bin\mongod.exe" -ArgumentList "--dbpath `"$DataRoot\db`" --bind_ip 127.0.0.1 --port 27017 --logpath `"$DataRoot\logs\mongod.log`" --logappend" -WindowStyle Hidden
  Start-Sleep 5
}
"database : " + $(if (& $listening 27017) { 'hidup (127.0.0.1:27017)' } else { 'GAGAL' })

# 2. Backend (membaca .env di folder app; HOST=127.0.0.1 agar tidak terbuka ke jaringan)
if (-not (Test-Path "$app\dist\main.js")) { throw "Build belum ada. Jalankan: npm run build:all" }
if (-not (& $listening $LocalPort)) {
  Start-Process node -ArgumentList '--env-file=.env', 'dist/main.js' -WorkingDirectory $app -WindowStyle Hidden `
    -RedirectStandardOutput "$DataRoot\logs\backend.out.log" -RedirectStandardError "$DataRoot\logs\backend.err.log"
  Start-Sleep 5
}
"backend  : " + $(if (& $listening $LocalPort) { "hidup (127.0.0.1:$LocalPort)" } else { 'GAGAL, lihat logs\backend.err.log' })

# 3. Tunnel balik ke VPS: port $RemotePort di VPS (hanya loopback) diteruskan ke backend di PC ini.
$tun = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match 'notam-tunnel' }
if ($tun) { 'tunnel   : sudah berjalan' }
elseif (-not $KeyPath -or -not (Test-Path $KeyPath)) { 'tunnel   : DILEWATI (isi -KeyPath atau variabel NOTAM_SSH_KEY)' }
else {
  $loop = "# notam-tunnel`n" +
    "while (`$true) { & ssh -i '$KeyPath' -o BatchMode=yes -o ConnectTimeout=10 $VpsHost 'fuser -k ${RemotePort}/tcp >/dev/null 2>&1'; & ssh -i '$KeyPath' -N -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=20 -o ServerAliveCountMax=3 -o StrictHostKeyChecking=accept-new " +
    "-R 127.0.0.1:${RemotePort}:127.0.0.1:${LocalPort} $VpsHost; Start-Sleep 10 }"
  Start-Process powershell -ArgumentList '-NoProfile', '-WindowStyle', 'Hidden', '-Command', $loop -WindowStyle Hidden
  Start-Sleep 4
  'tunnel   : dijalankan (otomatis tersambung ulang bila putus)'
}
