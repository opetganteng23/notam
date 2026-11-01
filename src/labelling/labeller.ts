export interface Entity {
  text: string;
  label: string;
  start: number;
  end: number;
}

export interface Labelled {
  labelled: string;
  entities: Entity[];
}

const MONTH = '(?:januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)';
const ZONE = '(?:\\s*(?:WIB|WITA|WIT|UTC))?';
const CLOCK = `(?:pukul|jam)\\s+\\d{1,2}[.:]?\\d{2}${ZONE}`;
const DATE = `(?:tanggal\\s+)?\\d{1,2}\\s+${MONTH}(?:\\s+\\d{4})?`;
const DATETIME = new RegExp(`${DATE}(?:\\s*,?\\s*${CLOCK})?|${CLOCK}`, 'gi');
const RANGE_WORD = /(?:sampai(?:\s+dengan)?|hingga|s\.?d\.?|-)\s*$/i;

// Label subjek/kondisi mengikuti Q-code (prioritas panduan pelabelan); sisanya singkatan standar.
// Dipilih hanya padanan yang konsisten di dataset (mis. "ditutup" -> LC pada 101/101 NOTAM).
const LEXICON: [RegExp, string][] = [
  [/landasan pacu|runway/gi, 'MR'],
  [/taxiway/gi, 'MX'],
  [/apron/gi, 'MN'],
  [/\bPAPI\b/g, 'LP'],
  [/\b(?:ILS|VOR|DME|RFFS)\b/g, ''], // label = istilah itu sendiri
  [/ditutup|penutupan|tutup/gi, 'LC'],
  [/tidak beroperasi|tidak dapat digunakan|unserviceable/gi, 'AS'],
  [/kembali beroperasi|beroperasi normal/gi, 'AK'],
  [/telah selesai|selesai|completed/gi, 'CC'],
  [/terpasang|dipasang|installed/gi, 'CS'],
  [/pekerjaan/gi, 'WIP'],
];

const DESIGNATOR = /^(?:\d{2}[LRC]?(?:\/\d{2}[LRC]?)?|[A-Z]{1,3}\d{0,2})(?:\s+antara\s+(?:taxiway\s+)?[A-Z0-9]+\s+dan\s+(?:taxiway\s+)?[A-Z0-9]+)?$/i;
const DESIGNATOR_UPPER = /^(?:\d|[A-Z])/;

// Pelabelan berbasis aturan untuk narasi NOTAM (format "teks/LABEL"), sebagai draf yang ditinjau manusia.
// Bukan model: istilah di luar kamus dibiarkan tanpa label.
export function labelNarrative(text: string): Labelled {
  const entities: Entity[] = [];
  const free = (s: number, e: number) => !entities.some((x) => s < x.end && e > x.start);
  const add = (s: number, e: number, label: string) => {
    if (e > s && free(s, e)) entities.push({ text: text.slice(s, e), label, start: s, end: e });
  };

  // Prioritas: RMK, D, lokasi, B/C, posisi, kamus.
  const rmk = /\bcatatan\s*:?[^\n]*/i.exec(text);
  if (rmk) add(rmk.index, rmk.index + rmk[0].trimEnd().length, 'RMK');

  // Jadwal "setiap hari <jam> sampai <jam>"; jadwal per hari-dalam-pekan (mis. "setiap hari Senin ...") tidak dikenali.
  const clock = `\\d{2}[.:]?\\d{2}${ZONE}`;
  for (const m of text.matchAll(new RegExp(`(?:setiap hari|tiap hari|harian)(?:\\s+(?:dari|pada))?\\s+(?:pukul|jam)\\s+${clock}\\s+(?:sampai(?:\\s+dengan)?|hingga|s\\.?d\\.?)\\s+(?:(?:pukul|jam)\\s+)?${clock}`, 'gi')))
    add(m.index!, m.index! + m[0].length, 'D');

  // Lokasi: dengan "(LOCID)" bila ada, selain itu nama sampai kata kerja/keterangan berikutnya.
  const STOP = 'ditutup|tidak|mulai|pada|dari|karena|dikarenakan|telah|kembali|sampai|hingga|dengan|dilakukan|akan|untuk|sedang|ada|setiap|jam|pukul|tanggal|di|dipindahkan|penggunaannya|mengalami|dibatasi|diberlakukan|terdapat|strip|runway|landasan|taxiway|apron';
  for (const m of text.matchAll(new RegExp(`(?:Bandar Udara|Bandara)\\s+.+?(?:\\s*\\([A-Z]{4}\\)|(?=\\s+(?:${STOP})\\b|[,.\\n(]|$))`, 'gi')))
    add(m.index!, m.index! + m[0].trimEnd().length, 'LOCATION');

  const times = [...text.matchAll(DATETIME)].filter((m) => free(m.index!, m.index! + m[0].length));
  if (times[0]) add(times[0].index!, times[0].index! + times[0][0].length, 'B');
  if (times[1] && RANGE_WORD.test(text.slice(0, times[1].index!))) add(times[1].index!, times[1].index! + times[1][0].length, 'C');

  for (const m of text.matchAll(/(landasan pacu|runway|taxiway|apron)\s+(\S+(?:\s+antara\s+(?:taxiway\s+)?\S+\s+dan\s+(?:taxiway\s+)?\S+)?)/gi)) {
    const pos = m[2].replace(/[.,;]$/, '');
    if (DESIGNATOR_UPPER.test(pos) && DESIGNATOR.test(pos) && !/^(?:ILS|VOR|DME|PAPI|RFFS)\b/.test(pos)) {
      const start = m.index! + m[0].length - m[2].length;
      add(start, start + pos.length, 'POSITION');
    }
  }

  for (const m of text.matchAll(/\b(?:karena|dikarenakan|disebabkan(?:\s+oleh)?|akibat)\b/gi)) add(m.index!, m.index! + m[0].length, 'REASON');

  for (const [re, label] of LEXICON)
    for (const m of text.matchAll(re)) add(m.index!, m.index! + m[0].length, label || m[0].toUpperCase());

  entities.sort((a, b) => a.start - b.start);
  let out = '';
  let pos = 0;
  for (const e of entities) {
    out += text.slice(pos, e.end) + '/' + e.label;
    pos = e.end;
  }
  return { labelled: out + text.slice(pos), entities };
}
