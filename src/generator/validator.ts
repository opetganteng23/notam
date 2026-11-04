import { findAirport } from '../master/airports';
import { expectedUtcPlan } from '../master/time';
import { qcodeWarnings } from '../master/icao-qcode';
import { tpsWarnings } from '../master/tps';

export interface Issue {
  code: string;
  level: 'error' | 'warning';
  message: string;
}

export interface Validation {
  status: 'passed' | 'warning' | 'failed';
  issues: Issue[];
}

const Q_LINE = /^[A-Z]{4}\/Q[A-Z]{4}\/[IVK]{1,2}\/[NBOMK]{1,3}\/[AEW]{1,2}\/\d{3}\/\d{3}\/\d{4}[NS]\d{5}[EW]\d{3}$/;

// Input yang menyebut penutupan atau "tidak dapat digunakan": menurut AirNav keduanya berstatus closed (CLSD).
const CLOSED_INPUT = /ditutup|penutupan|tutup|closed|\bclose\b|clsd|(?:tidak|belum)\s+(?:dapat|bisa|boleh)\s+(?:di)?(?:gunakan|pergunakan|pakai|operasikan|landasi|darati|lalui)|rusak/i;

// Petunjuk bahwa input menyebut pekerjaan. "DUE TO WIP" tanpa ini adalah alasan karangan: di dataset 156 dari 167 NOTAM ber-WIP inputnya menyebut pekerjaan.
const WORK_INPUT = /pekerja|pengerja|dikerja|kerja|\bwork|\bwip\b|perbaik|pelebar|pemasang|penggantian|pembangun|konstruksi|construction|overlay|pelapis|pengecat|pembersih|marking|penambahan|pembuatan|galian|penutup|pemeliharaan|perawatan|instalasi/i;

const SCHEDULE_HINT = /setiap hari|tiap hari|harian|\bdaily\b/i;

// Petunjuk bahwa input menyebut alasan (kata penyebab, atau jenis kegiatan/kejadian). Dipakai agar "DUE TO ..." di E) tidak muncul dari karangan model.
export const REASON_CUE = new RegExp(
  String.raw`\b(?:karena|dikarenakan|disebabkan|akibat|sebab|dalam rangka|sehubungan|guna\b|untuk keperluan|alasan|due to|because|reason|teknis|operasional|keamanan|cuaca|erupsi|letusan|abu vulkanik|kebakaran|banjir|bencana|kalibrasi|calibrat|inspeksi|inspect|pemeriksaan|latihan|training|exercise|vip|haji|hajj|event|acara|kegiatan|upacara|perbaik|diperbaik|memperbaik|repair|pelihara|pemelihara|dipelihara|perawat|dirawat|rusak|kerusakan|lubang|pothole|maint|pekerja|pengerja|dikerja|kerja|work|wip|pembangun|konstruksi|construction|pelebar|pemasang|penggantian|pembersih|pengecat|marking|overlay)`,
  'i',
);

// Mengurai item Q) A) B) C) D) E) dari teks NOTAM; E) boleh multi-baris.
export function parseItems(text: string): Record<string, string> {
  const items: Record<string, string> = {};
  let cur = '';
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([QABCDE])\)\s*(.*)$/.exec(line);
    if (m) {
      cur = m[1];
      items[cur] = m[2].trim();
    } else if (cur) {
      items[cur] += '\n' + line.trim();
    }
  }
  return items;
}

// B)/C): YYMMDDHHMM (UTC) dan tanggal harus nyata.
function parseTime(v: string): number | null {
  const m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(v);
  if (!m) return null;
  const [yy, mo, dd, hh, mi] = m.slice(1).map(Number);
  const d = new Date(Date.UTC(2000 + yy, mo - 1, dd, hh, mi));
  const real = d.getUTCMonth() === mo - 1 && d.getUTCDate() === dd && hh < 24 && mi < 60;
  return real ? d.getTime() : null;
}

// Hanya aturan yang dapat diperiksa deterministik; aturan domain lain menunggu persetujuan AirNav.
// freeText (opsional): bila memuat tanggal+jam berlabel zona, B)/C) harus sama dengan konversi UTC-nya.
export function validateNotam(text: string, airportLocId: string, freeText?: string): Validation {
  const issues: Issue[] = [];
  const err = (code: string, message: string) => issues.push({ code, level: 'error', message });
  const warn = (code: string, message: string) => issues.push({ code, level: 'warning', message });
  const it = parseItems(text);
  const airport = findAirport(airportLocId);

  for (const k of ['Q', 'A', 'B', 'E']) if (!it[k]) err(`MISSING_${k}`, `Item ${k}) tidak ada`);

  if (it.Q) {
    if (!Q_LINE.test(it.Q)) err('Q_FORMAT', 'Format Q) tidak sesuai pola FIR/QXXXX/traffic/purpose/scope/lower/upper/koordinat+radius');
    else if (airport && it.Q.split('/')[0] !== airport.fir) warn('Q_FIR', `FIR di Q) (${it.Q.split('/')[0]}) berbeda dari FIR master bandara (${airport.fir})`);
    if (Q_LINE.test(it.Q)) for (const w of [...qcodeWarnings(it.Q, it.E), ...tpsWarnings(it.Q)]) warn(w.code, w.message);
  }
  if (it.A && it.A !== airportLocId) err('A_MISMATCH', `A) (${it.A}) tidak sama dengan locator pengajuan (${airportLocId}). Periksa apakah locator atau narasi yang keliru`);

  const b = it.B ? parseTime(it.B) : null;
  if (it.B && b === null) err('B_FORMAT', 'B) harus YYMMDDHHMM dengan tanggal yang valid');
  if (it.C && !/^(PERM|\d{10}( ?EST)?)$/.test(it.C)) err('C_FORMAT', 'C) harus YYMMDDHHMM (opsional EST) atau PERM');
  const c = it.C ? parseTime(it.C.replace(/ ?EST$/, "")) : null;
  if (it.C && /^\d{10}/.test(it.C) && c === null) err('C_FORMAT', 'C) berisi tanggal yang tidak valid');
  if (b !== null && c !== null && c < b) err('C_BEFORE_B', 'C) lebih awal dari B)');
  if (!it.C) warn('C_MISSING', 'C) tidak ada (wajib kecuali PERM)');

  const plan = freeText ? expectedUtcPlan(freeText) : {};
  const cStamp = it.C?.replace(/ ?EST$/, '');
  if (plan.B && it.B && /^\d{10}$/.test(it.B) && it.B !== plan.B) err('B_UTC_MISMATCH', `B) (${it.B}) tidak sama dengan konversi UTC dari teks input (${plan.B})`);
  if (plan.C && cStamp && /^\d{10}$/.test(cStamp) && cStamp !== plan.C) err('C_UTC_MISMATCH', `C) (${cStamp}) tidak sama dengan konversi UTC dari teks input (${plan.C})`);

  // D): jadwal harian; setiap rentang HHMM-HHMM harus jam yang nyata (2400 diperbolehkan).
  if (it.D) {
    const hhmm = (v: string) => +v.slice(2) < 60 && (+v.slice(0, 2) < 24 || v === '2400');
    const ranges = [...it.D.matchAll(/(\d{4})\s*-\s*(\d{4})/g)];
    if (!ranges.length) err('D_FORMAT', 'D) tidak memuat rentang jam HHMM-HHMM');
    else if (ranges.some((r) => !hhmm(r[1]) || !hhmm(r[2]))) err('D_FORMAT', 'D) berisi jam yang tidak valid');
  } else if (freeText && SCHEDULE_HINT.test(freeText)) warn('D_MISSING', 'Input menyebut jadwal berulang tetapi D) tidak ada');

  // RMK ada di dalam E); bila ada harus berisi teks.
  const rmk = it.E ? /\bRMK\s*:?\s*([\s\S]*)$/.exec(it.E) : null;
  if (rmk && !rmk[1].trim()) err('RMK_EMPTY', 'RMK ada tetapi kosong');
  if (!rmk && freeText && /\bcatatan\b/i.test(freeText)) warn('RMK_MISSING', 'Input memuat "Catatan" tetapi RMK tidak ada di E)');

  // CLSD hanya bila input menyebut ditutup atau tidak dapat digunakan; pekerjaan atau pembatasan yang masih memungkinkan operasi (di bawah kendali ATC) berstatus WIP atau LIMITED.
  if (freeText && it.E && /\bCLSD\b/.test(it.E.split(/\bRMK\b/i)[0]) && !CLOSED_INPUT.test(freeText))
    warn('CLSD_NOT_IN_INPUT', 'E) memuat CLSD tetapi input tidak menyebut ditutup atau tidak dapat digunakan. Bila masih bisa dipakai di bawah kendali ATC, statusnya WIP atau LIMITED, bukan CLSD');

  // WIP berarti ada pekerjaan; bila input hanya menyebut sebab lain (mis. ada pesawat di landasan), alasan WIP salah.
  if (freeText && it.E && /\bDUE TO [A-Z ]*\bWIP\b/.test(it.E.split(/\bRMK\b/i)[0]) && !WORK_INPUT.test(freeText))
    warn('REASON_WIP_NOT_IN_INPUT', 'E) menulis alasan WIP (pekerjaan) tetapi input tidak menyebut pekerjaan. Periksa alasan yang sebenarnya');

  // Alasan di E) (DUE TO ..., di luar RMK) harus bersumber dari input; model cenderung menambahkannya dari contoh referensi.
  if (freeText && it.E && /\bDUE\s+TO\b/i.test(it.E.split(/\bRMK\b/i)[0]) && !REASON_CUE.test(freeText))
    warn('REASON_NOT_IN_INPUT', 'E) memuat alasan (DUE TO ...) tetapi input tidak menyebut alasan. Hapus alasannya, atau lengkapi narasi bila alasan memang ada');

  const status = issues.some((i) => i.level === 'error') ? 'failed' : issues.length ? 'warning' : 'passed';
  return { status, issues };
}
