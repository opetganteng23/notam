# Mendaftarkan tugas Windows agar semua komponen NOTAM menyala sendiri saat PC dinyalakan, tanpa perlu login.
#   powershell -ExecutionPolicy Bypass -File deploy\windows\install-autostart.ps1 -KeyPath C:\jalur\kunci.pem
# Batalkan dengan uninstall-autostart.ps1. Tugas berjalan sebagai akun Anda (tanpa menyimpan password), sehingga bisa jalan sebelum login.
# Jalankan PowerShell sebagai Administrator.
param([string]$KeyPath = $env:NOTAM_SSH_KEY, [int]$DelaySec = 60)
$ErrorActionPreference = 'Stop'
if (-not $KeyPath -or -not (Test-Path $KeyPath)) { throw 'Isi -KeyPath dengan lokasi kunci SSH (atau set NOTAM_SSH_KEY).' }
$script = (Resolve-Path "$PSScriptRoot\start-all.ps1").Path
$arg = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`" -KeyPath `"$((Resolve-Path $KeyPath).Path)`""
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg
$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = "PT${DelaySec}S"
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
Register-ScheduledTask -TaskName 'NOTAM - Nyalakan layanan' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Menyalakan Ollama, database, backend, dan tunnel NOTAM saat PC dinyalakan (tanpa login).' -Force | Out-Null
"Terdaftar: NOTAM akan menyala sendiri $DelaySec detik setelah PC dinyalakan, walaupun belum login."
