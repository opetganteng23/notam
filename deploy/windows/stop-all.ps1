# Menghentikan backend, tunnel, dan database NOTAM di PC ini. Hanya proses milik NOTAM yang disentuh.
param([int]$LocalPort = 3300, [switch]$KeepDb)
$stopPid = { param($id, $name) if ($id) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue; "$name dihentikan (PID $id)" } else { "$name tidak berjalan" } }

# Tunnel: loop PowerShell bertanda notam-tunnel beserta ssh anaknya
$loops = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match 'notam-tunnel' }
foreach ($l in $loops) {
  Get-CimInstance Win32_Process -Filter "ParentProcessId=$($l.ProcessId)" | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Stop-Process -Id $l.ProcessId -Force -ErrorAction SilentlyContinue
}
"tunnel $(if ($loops) { 'dihentikan' } else { 'tidak berjalan' })"

# Backend: hanya bila prosesnya menjalankan dist/main.js dari proyek ini
$c = Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue
if ($c -and ((Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)").CommandLine -match 'dist/main\.js')) { & $stopPid $c.OwningProcess 'backend' } else { 'backend tidak berjalan' }

if (-not $KeepDb) {
  $m = Get-NetTCPConnection -LocalPort 27017 -State Listen -ErrorAction SilentlyContinue
  if ($m -and ((Get-CimInstance Win32_Process -Filter "ProcessId=$($m.OwningProcess)").Name -eq 'mongod.exe')) { & $stopPid $m.OwningProcess 'database' } else { 'database tidak berjalan' }
}
