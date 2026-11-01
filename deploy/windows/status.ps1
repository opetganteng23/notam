# Memeriksa semua komponen NOTAM di PC ini dan di domain publik (hanya membaca).
param([string]$PublicUrl = 'https://notam.ailabs.or.id')
$listening = { param($p) [bool](Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) }
$line = { param($name, $ok, $detail) '{0,-9}: {1}  {2}' -f $name, $(if ($ok) { 'HIDUP ' } else { 'MATI  ' }), $detail }

& $line 'LLM' (& $listening 11434) 'Ollama, 127.0.0.1:11434'
& $line 'Database' (& $listening 27017) 'MongoDB, 127.0.0.1:27017'

$health = $null
try { $health = (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3300/api/health -TimeoutSec 4).Content } catch { }
& $line 'Backend' ([bool]$health) $(if ($health) { $health } else { '127.0.0.1:3300 tidak menjawab' })

$tun = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'notam-tunnel' }
& $line 'Tunnel' ([bool]$tun) $(if ($tun) { 'terhubung ke VPS (otomatis tersambung ulang)' } else { 'tidak berjalan; situs publik tidak dapat menjangkau backend' })

$pub = $null
try { $pub = (Invoke-WebRequest -UseBasicParsing "$PublicUrl/api/health" -TimeoutSec 8).Content } catch { }
& $line 'Publik' ([bool]$pub) $(if ($pub) { "$PublicUrl -> $pub" } else { "$PublicUrl/api/health tidak menjawab" })
$auto = [bool](Get-ScheduledTask -TaskName 'NOTAM - Nyalakan layanan' -ErrorAction SilentlyContinue)
& $line 'Otomatis' $auto $(if ($auto) { 'menyala sendiri saat PC dihidupkan (batalkan: Batalkan-Otomatis-NOTAM.bat)' } else { 'belum aktif (aktifkan: Aktifkan-Otomatis-NOTAM.bat)' })
