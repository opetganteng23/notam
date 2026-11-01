# Menghapus tugas mulai-otomatis NOTAM.
Unregister-ScheduledTask -TaskName 'NOTAM - Nyalakan layanan' -Confirm:$false -ErrorAction SilentlyContinue
'Tugas mulai-otomatis NOTAM dihapus (bila ada).'
