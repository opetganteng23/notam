// Data kamus yang disusun tangan. Singkatan mengikuti istilah ICAO yang umum dipakai pada NOTAM; arti Indonesia
// adalah terjemahan kerja dan perlu divalidasi AirNav. Jumlah kemunculan dihitung dari dataset, bukan diketik.
export type Abbr = [kode: string, inggris: string, indonesia: string];

export const ABBR: { id: string; title: string; note?: string; items: Abbr[] }[] = [
  { id: 'area', title: 'Area pergerakan dan bandara', items: [
    ['RWY', 'Runway', 'Landasan pacu'], ['TWY', 'Taxiway', 'Landas hubung'], ['APN', 'Apron', 'Apron (pelataran parkir pesawat)'],
    ['STAND', 'Aircraft stand', 'Stand pesawat'], ['PRKG', 'Parking', 'Parkir'], ['THR', 'Threshold', 'Ambang landasan'],
    ['STRIP', 'Runway strip', 'Strip landasan'], ['SHOULDER', 'Shoulder', 'Bahu landasan'], ['CWY', 'Clearway', 'Clearway'],
    ['SWY', 'Stopway', 'Stopway'], ['AD', 'Aerodrome', 'Bandar udara'], ['TORA', 'Take-off run available', 'Jarak lepas landas tersedia'],
    ['TODA', 'Take-off distance available', 'Jarak lepas landas (TODA)'], ['ASDA', 'Accelerate-stop distance available', 'Jarak akselerasi-berhenti tersedia'],
    ['LDA', 'Landing distance available', 'Jarak pendaratan tersedia'], ['DISPLACED', 'Displaced', 'Dipindahkan (ambang landasan digeser)'],
    ['OVERLAY', 'Overlay', 'Pelapisan ulang landasan'], ['MARKING', 'Marking', 'Marka'], ['CENTERLINE', 'Centerline', 'Garis tengah'],
  ] },
  { id: 'lampu', title: 'Penerangan', items: [
    ['LGT', 'Light / lighting', 'Lampu / penerangan'], ['PAPI', 'Precision approach path indicator', 'Indikator jalur pendekatan presisi'],
    ['RTIL', 'Runway threshold identification lights', 'Lampu identifikasi ambang landasan'], ['REIL', 'Runway end identifier lights', 'Lampu identifikasi ujung landasan'],
    ['ALS', 'Approach lighting system', 'Sistem lampu pendekatan'], ['PALS', 'Precision approach lighting system', 'Sistem lampu pendekatan presisi'],
    ['EDGE', 'Edge (light)', 'Tepi (lampu tepi)'], ['ABN', 'Aerodrome beacon', 'Beacon bandara'],
  ] },
  { id: 'navigasi', title: 'Navigasi dan pendaratan', items: [
    ['ILS', 'Instrument landing system', 'Sistem pendaratan instrumen'], ['LOC', 'Localizer', 'Localizer'], ['GP', 'Glide path', 'Glide path'],
    ['DME', 'Distance measuring equipment', 'Alat pengukur jarak'], ['VOR', 'VHF omnidirectional radio range', 'VOR'],
    ['VOR/DME', 'VOR with DME', 'VOR digabung DME'], ['ILS/LOC', 'ILS localizer', 'ILS bagian localizer'], ['NDB', 'Non-directional radio beacon', 'NDB'],
    ['MM', 'Middle marker', 'Marker tengah'], ['RNP', 'Required navigation performance', 'Performa navigasi yang dipersyaratkan'],
    ['APCH', 'Approach', 'Pendekatan'], ['SID', 'Standard instrument departure', 'Prosedur keberangkatan instrumen standar'],
    ['STAR', 'Standard instrument arrival', 'Prosedur kedatangan instrumen standar'], ['CAT', 'Category', 'Kategori'],
    ['RADAR', 'Radar', 'Radar'], ['FREQ', 'Frequency', 'Frekuensi'], ['MHZ', 'Megahertz', 'Megahertz'], ['KHZ', 'Kilohertz', 'Kilohertz'],
  ] },
  { id: 'layanan', title: 'Layanan, publikasi, dan wilayah', items: [
    ['ATS', 'Air traffic services', 'Layanan lalu lintas udara'], ['ATC', 'Air traffic control', 'Pengendalian lalu lintas udara'],
    ['ATIS', 'Automatic terminal information service', 'Layanan informasi terminal otomatis'], ['AFIS', 'Aerodrome flight information service', 'Layanan informasi penerbangan bandara'],
    ['AIP', 'Aeronautical information publication', 'Publikasi informasi aeronautika'], ['AIRAC', 'Aeronautical information regulation and control', 'Pengaturan dan pengendalian informasi aeronautika'],
    ['AMDT', 'Amendment', 'Perubahan (amandemen)'], ['VOL', 'Volume', 'Volume'], ['NOTAM', 'Notice to airmen', 'Pemberitahuan kepada penerbang'],
    ['TMA', 'Terminal control area', 'Daerah kendali terminal'], ['FIR', 'Flight information region', 'Daerah informasi penerbangan'],
    ['FIC', 'Flight information centre', 'Pusat informasi penerbangan'], ['UAV', 'Unmanned aerial vehicle', 'Pesawat udara tanpa awak'],
  ] },
  { id: 'operasi', title: 'Kondisi, operasi, dan umum', items: [
    ['WIP', 'Work in progress', 'Sedang ada pekerjaan'], ['CLSD', 'Closed', 'Ditutup'], ['U/S', 'Unserviceable', 'Tidak dapat digunakan'],
    ['MAINT', 'Maintenance', 'Pemeliharaan'], ['TECR', 'Technical reason', 'Alasan teknis'], ['DUE', 'Due (to)', 'Karena'], ['RMK', 'Remark', 'Catatan'],
    ['TFC', 'Traffic', 'Lalu lintas'], ['CTN', 'Caution', 'Hati-hati'], ['ADZ', 'Advise', 'Memberitahukan / disarankan'], ['ACFT', 'Aircraft', 'Pesawat udara'],
    ['FLT', 'Flight', 'Penerbangan'], ['CLBR', 'Calibration', 'Kalibrasi'], ['EQPT', 'Equipment', 'Peralatan'], ['EXER', 'Exercise', 'Latihan'],
    ['VIP', 'Very important person', 'Tamu penting'], ['MOV', 'Movement', 'Pergerakan'], ['DLA', 'Delay', 'Tertunda'], ['EXP', 'Expect', 'Diperkirakan'],
    ['DEP', 'Departure', 'Keberangkatan'], ['ARR', 'Arrival', 'Kedatangan'], ['DEP/ARR', 'Departure / arrival', 'Keberangkatan / kedatangan'],
    ['LDG', 'Landing', 'Pendaratan'], ['TKOF', 'Take-off', 'Lepas landas'], ['OPS', 'Operations', 'Operasi'], ['OPR', 'Operation / operating', 'Beroperasi'],
    ['NML', 'Normal', 'Normal'], ['RESUMED', 'Resumed', 'Kembali / dilanjutkan'], ['AVBL', 'Available', 'Tersedia'], ['LTD', 'Limited', 'Terbatas'],
    ['SUBJ', 'Subject (to)', 'Tergantung pada'], ['CLR', 'Clearance', 'Izin'], ['FLW', 'Following', 'Berikut'], ['FM', 'From', 'Dari'], ['BTN', 'Between', 'Antara'],
    ['PSN', 'Position', 'Posisi'], ['HGT', 'Height', 'Tinggi'], ['OBST', 'Obstacle', 'Rintangan'], ['COORD', 'Coordinates', 'Koordinat'], ['WI', 'Within', 'Dalam'],
    ['REF', 'Reference', 'Rujukan'], ['WEF', 'With effect from', 'Berlaku mulai'], ['EXC', 'Except', 'Kecuali'], ['MIL', 'Military', 'Militer'],
    ['HVY', 'Heavy', 'Berat'], ['NR', 'Number', 'Nomor'], ['HOURS', 'Hours (of service)', 'Jam (layanan)'],
  ] },
  { id: 'waktu', title: 'Waktu, hari, dan satuan', items: [
    ['UTC', 'Coordinated universal time', 'Waktu universal terkoordinasi'], ['LCL', 'Local time', 'Waktu setempat'], ['EST', 'Estimated', 'Perkiraan (dipakai di item C)'],
    ['PERM', 'Permanent', 'Permanen (dipakai di item C)'], ['DAILY', 'Daily', 'Setiap hari (item D)'], ['DLY', 'Daily', 'Setiap hari'],
    ['MON', 'Monday', 'Senin'], ['TUE', 'Tuesday', 'Selasa'], ['WED', 'Wednesday', 'Rabu'], ['THU', 'Thursday', 'Kamis'], ['FRI', 'Friday', 'Jumat'],
    ['SAT', 'Saturday', 'Sabtu'], ['SUN', 'Sunday', 'Minggu'], ['M', 'Metre', 'Meter'], ['KM', 'Kilometre', 'Kilometer'], ['NM', 'Nautical mile', 'Mil laut'],
    ['FT', 'Feet', 'Kaki'], ['FL', 'Flight level', 'Tingkat penerbangan'], ['AGL', 'Above ground level', 'Di atas permukaan tanah'],
    ['AMSL', 'Above mean sea level', 'Di atas permukaan laut rata-rata'], ['SFC', 'Surface', 'Permukaan'], ['GND', 'Ground', 'Tanah'], ['UNL', 'Unlimited', 'Tanpa batas'],
  ] },
];

export const ISTILAH: [indonesia: string, notam: string, keterangan: string][] = [
  ['landasan pacu, runway', 'RWY', 'Subjek kode Q: MR'], ['landas hubung, taxiway', 'TWY', 'Subjek kode Q: MX'], ['apron', 'APRON / APN', 'Subjek kode Q: MN'],
  ['stand pesawat, tempat parkir pesawat', 'ACFT STAND / PRKG STAND', 'Subjek kode Q: MP'], ['bahu landasan', 'SHOULDER', 'Subjek kode Q: MW'],
  ['ambang landasan', 'THR', 'Subjek kode Q: MT'], ['ditutup, penutupan, tutup', 'CLSD', 'Kondisi kode Q: LC'],
  ['tidak dapat digunakan, tidak beroperasi', 'U/S', 'Kondisi kode Q: AS'], ['kembali beroperasi normal', 'RESUMED NML OPS', 'Kondisi kode Q: AK'],
  ['pekerjaan, pengerjaan', 'WIP', 'Kondisi kode Q: HW'], ['karena, dikarenakan', 'DUE TO', 'Alasan (entitas REASON)'], ['pemeliharaan', 'MAINT', ''],
  ['alasan teknis', 'TECR', ''], ['catatan', 'RMK:', 'Ditulis di akhir item E'], ['semua pesawat', 'ALL ACFT', ''], ['berhati-hati', 'CTN', ''],
  ['lampu', 'LGT', 'Subjek kode Q: kelompok L'], ['kalibrasi, terbang kalibrasi', 'CLBR FLT', ''], ['latihan darurat', 'EMERGENCY EXER', ''],
  ['terbatas', 'LIMITED / LTD', 'Kondisi kode Q: LT'], ['dipindahkan (ambang landasan)', 'DISPLACED THR', 'Kondisi kode Q: CM'],
  ['rintangan, hambatan', 'OBST', 'Subjek kode Q: OB'], ['pemadam kebakaran', 'RESCUE AND FIRE FIGHTING / RFFS', 'Subjek kode Q: FF'],
  ['jam layanan', 'HOURS OF SERVICE', 'Kondisi kode Q: AH'], ['frekuensi', 'FREQ', ''], ['setiap hari', 'DAILY', 'Ditulis di item D, mis. DAILY 1500-1915'],
  ['mulai tanggal ... pukul ...', '(item B)', 'Dikonversi ke UTC, format YYMMDDHHMM'], ['sampai tanggal ... pukul ...', '(item C)', 'Dikonversi ke UTC, format YYMMDDHHMM'],
  ['permanen', 'PERM', 'Pengganti tanggal di item C'], ['perkiraan', 'EST', 'Ditambahkan di belakang tanggal item C'],
];

export const ITEM_NOTAM: { item: string; arti: string; format: string; contoh: string; aturan: string }[] = [
  { item: 'Q)', arti: 'Garis kualifikasi', format: 'FIR/Qkode/traffic/purpose/scope/bawah/atas/koordinat+radius', contoh: 'WIIF/QMRLC/IV/NBO/A/000/999/0616S10653E005', aturan: 'Pola diperiksa. FIR dibandingkan dengan master bandara dan dikoreksi otomatis bila berbeda.' },
  { item: 'A)', arti: 'Lokator bandara', format: '4 huruf kapital (ICAO)', contoh: 'WIHH', aturan: 'Harus sama dengan bandara pada pengajuan.' },
  { item: 'B)', arti: 'Waktu mulai (UTC)', format: 'YYMMDDHHMM', contoh: '2611050100', aturan: 'Tanggal harus nyata. Jam berlabel WIB, WITA, atau WIT dikonversi otomatis ke UTC.' },
  { item: 'C)', arti: 'Waktu berakhir (UTC)', format: 'YYMMDDHHMM, boleh diikuti EST, atau PERM', contoh: '2611060500', aturan: 'Tidak boleh lebih awal dari B). Konversi UTC sama seperti B).' },
  { item: 'D)', arti: 'Jadwal harian atau mingguan', format: 'HHMM-HHMM (boleh didahului DAILY atau nama hari)', contoh: 'DAILY 1500-1915', aturan: 'Setiap rentang jam harus nyata (2400 diperbolehkan). Peringatan bila narasi menyebut "setiap hari" tetapi D) kosong.' },
  { item: 'E)', arti: 'Uraian NOTAM', format: 'Teks bahasa singkat ICAO, boleh beberapa baris', contoh: 'RWY 06/24 CLSD DUE TO WIP', aturan: 'Wajib ada. Catatan (RMK) berada di dalam E) dan tidak boleh kosong; peringatan bila narasi menyebut "Catatan" tetapi RMK tidak ada.' },
  { item: 'F) / G)', arti: 'Batas bawah dan atas ketinggian', format: 'Ketinggian atau SFC/UNL', contoh: 'SFC / UNL', aturan: 'Belum diproses oleh sistem.' },
];

export const Q_LINE: { bagian: string; arti: string; nilai: string }[] = [
  { bagian: 'FIR', arti: 'Daerah informasi penerbangan', nilai: 'WIIF (Jakarta) atau WAAF (Ujung Pandang)' },
  { bagian: 'Kode Q', arti: 'Lima huruf: Q + subjek (2 huruf) + kondisi (2 huruf)', nilai: 'QMRLC = Runway (MR) + ditutup (LC)' },
  { bagian: 'Traffic', arti: 'Jenis lalu lintas', nilai: 'I = IFR, V = VFR, IV = keduanya, K = checklist' },
  { bagian: 'Purpose', arti: 'Tujuan NOTAM', nilai: 'N = perhatian langsung penerbang, B = penting secara operasional (masuk PIB), O = operasi penerbangan, M = lain-lain, K = checklist' },
  { bagian: 'Scope', arti: 'Lingkup', nilai: 'A = bandara, E = rute, W = peringatan navigasi (boleh gabungan, mis. AE)' },
  { bagian: 'Batas bawah / atas', arti: 'Ketinggian dalam ratusan kaki (FL)', nilai: '000 sampai 999' },
  { bagian: 'Koordinat dan radius', arti: 'Titik pusat dan radius pengaruh', nilai: 'DDMM[N/S]DDDMM[E/W]RRR, radius dalam NM (mis. 0616S10653E005)' },
];

export const FIR_NAME: Record<string, string> = { WIIF: 'Jakarta FIR', WAAF: 'Ujung Pandang FIR (Makassar)' };

export const WAKTU_ZONA: { zona: string; selisih: string; wilayah: string }[] = [
  { zona: 'WIB', selisih: 'UTC+7', wilayah: 'Waktu Indonesia Barat' },
  { zona: 'WITA', selisih: 'UTC+8', wilayah: 'Waktu Indonesia Tengah' },
  { zona: 'WIT', selisih: 'UTC+9', wilayah: 'Waktu Indonesia Timur' },
  { zona: 'UTC', selisih: 'UTC+0', wilayah: 'Waktu universal; dipakai di item B) dan C)' },
];

export const WAKTU_ATURAN: { aturan: string; keterangan: string }[] = [
  { aturan: 'Jam berlabel WIB, WITA, atau WIT', keterangan: 'Dikonversi otomatis ke UTC oleh sistem. Contoh: 08.00 WIB tanggal 5 November 2026 menjadi 2611050100. Jam yang melewati tengah malam menggeser tanggal.' },
  { aturan: 'Jam tanpa label zona', keterangan: 'Ditulis apa adanya (tidak diasumsikan lokal), sesuai kebiasaan pada dataset. Aturan resmi menunggu penegasan AirNav.' },
  { aturan: 'Zona bandara', keterangan: 'Diturunkan dari bujur ARP: di bawah 114,5°BT = WIB, 114,5° sampai di bawah 126,5° = WITA, 126,5° ke atas = WIT. Bandara dekat batas zona dapat keliru.' },
  { aturan: 'Pemeriksaan', keterangan: 'Bila narasi memuat tanggal dan jam berlabel zona, item B) dan C) harus sama dengan hasil konversi; selisih dianggap kesalahan.' },
];

export const PERAN: { peran: string; tugas: string; batas: string }[] = [
  { peran: 'ORIGINATOR', tugas: 'Menulis narasi, menyusun NOTAM, memeriksa draf, lalu submit ke ATS atau langsung ke PIA. Dapat menyusun ulang, memakai ulang teks lama, dan mengunduh PDF.', batas: 'Satu-satunya peran yang dapat generate. Hanya melihat pengajuan miliknya.' },
  { peran: 'ATS', tugas: 'Meninjau pesan dan NOTAM; memutuskan Accept, Revisi, atau Reject. Tahap ini opsional.', batas: 'Tidak dapat generate. Catatan wajib untuk Revisi dan Reject.' },
  { peran: 'PIA', tugas: 'Meninjau hasil ATS (atau langsung dari Originator); memutuskan Accept, Revisi, atau Reject.', batas: 'Revisi ke Originator dibatasi 3 kali; setelah itu hanya Accept atau Reject.' },
  { peran: 'NOF', tugas: 'Persetujuan akhir. Accept menyetujui; Revisi atau Reject mengembalikan ke PIA.', batas: 'Pengembalian ke PIA tidak dihitung dalam batas 3 kali.' },
  { peran: 'ADMIN', tugas: 'Memantau, mengelola pengguna, mengatur generate, melihat audit log, laporan, dan kamus.', batas: 'Tidak dapat generate atau memutuskan. Tidak melihat Draft.' },
];

export const STATUS: { status: string; arti: string; berikutnya: string }[] = [
  { status: 'Draft', arti: 'Disusun Originator, belum dikirim.', berikutnya: 'Submit ke ATS atau PIA' },
  { status: 'Review ATS', arti: 'Menunggu keputusan ATS.', berikutnya: 'Accept ke PIA, Revisi ke Originator, atau Reject (final)' },
  { status: 'Review PIA', arti: 'Menunggu keputusan PIA.', berikutnya: 'Accept ke NOF, Revisi ke Originator, atau Reject (final)' },
  { status: 'Review NOF', arti: 'Menunggu persetujuan akhir NOF.', berikutnya: 'Accept (disetujui), Revisi atau Reject kembali ke PIA' },
  { status: 'Perlu revisi', arti: 'Dikembalikan ke Originator dengan catatan.', berikutnya: 'Ubah teks, susun ulang, submit lagi' },
  { status: 'Ditolak', arti: 'Ditolak ATS atau PIA; perlu pengajuan baru.', berikutnya: 'Final' },
  { status: 'Disetujui NOF', arti: 'Dinyatakan sesuai oleh NOF.', berikutnya: 'Final' },
];

export const VALIDASI: { kode: string; tingkat: 'error' | 'warning'; arti: string }[] = [
  { kode: 'MISSING_Q / MISSING_A / MISSING_B / MISSING_E', tingkat: 'error', arti: 'Item wajib tidak ada.' },
  { kode: 'Q_FORMAT', tingkat: 'error', arti: 'Garis Q tidak sesuai pola.' },
  { kode: 'Q_FIR', tingkat: 'warning', arti: 'FIR di Q) berbeda dari master bandara (dikoreksi otomatis).' },
  { kode: 'A_MISMATCH', tingkat: 'error', arti: 'Lokator A) tidak sama dengan bandara pengajuan.' },
  { kode: 'B_FORMAT / C_FORMAT', tingkat: 'error', arti: 'Waktu bukan YYMMDDHHMM yang valid.' },
  { kode: 'C_BEFORE_B', tingkat: 'error', arti: 'C) lebih awal dari B).' },
  { kode: 'C_MISSING', tingkat: 'warning', arti: 'C) tidak ada (wajib kecuali PERM).' },
  { kode: 'B_UTC_MISMATCH / C_UTC_MISMATCH', tingkat: 'error', arti: 'Tidak sama dengan konversi UTC dari narasi.' },
  { kode: 'D_FORMAT', tingkat: 'error', arti: 'D) tidak memuat rentang jam HHMM-HHMM yang valid.' },
  { kode: 'D_MISSING', tingkat: 'warning', arti: 'Narasi menyebut jadwal berulang tetapi D) kosong.' },
  { kode: 'RMK_EMPTY', tingkat: 'error', arti: 'RMK ada tetapi kosong.' },
  { kode: 'RMK_MISSING', tingkat: 'warning', arti: 'Narasi memuat "Catatan" tetapi RMK tidak ada.' },
];

export const PELABELAN: { entitas: string; arti: string; contoh: string }[] = [
  { entitas: '/LOCATION', arti: 'Lokasi bandara', contoh: 'Bandara Sam Ratulangi - Manado (WAMM)/LOCATION' },
  { entitas: '/POSITION', arti: 'Tempat hal terjadi (yang dirujuk)', contoh: 'Taxiway/MX WP/POSITION' },
  { entitas: '/REASON', arti: 'Alasan hal yang terjadi', contoh: 'karena/REASON ada pekerjaan/WIP' },
  { entitas: '/B', arti: 'Waktu mulai NOTAM', contoh: 'pukul 15.00/B' },
  { entitas: '/C', arti: 'Waktu berakhir NOTAM', contoh: 'pukul 19.15/C' },
  { entitas: '/D', arti: 'Jadwal harian', contoh: 'setiap hari pada jam 1500 sampai dengan 1915/D' },
  { entitas: '/RMK', arti: 'Catatan', contoh: 'Catatan: Semua pesawat berhati-hati/RMK' },
  { entitas: '/MR, /MX, /LC, /WIP, dan seterusnya', arti: 'Entitas lain mengikuti kode Q atau singkatan standar; kode Q diprioritaskan daripada singkatan', contoh: 'Taxiway/MX (bukan TWY); ditutup/LC; pekerjaan/WIP' },
];
