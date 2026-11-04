const OFFSET: Record<string, number> = { WIB: 7, WITA: 8, WIT: 9 };

// Jam: "03.00", "03:00", atau 4 digit tanpa pemisah "0300". Tanpa pemisah wajib tepat 4 digit (HHMM) agar angka lain, mis. tahun "2026", tidak terbaca sebagai jam.
const CLOCK = '(?:([01]?\\d|2[0-3])[.:]([0-5]\\d)|([01]\\d|2[0-3])([0-5]\\d))';
const ZONES = 'WITA|WIB|WIT|UTC|GMT|Z|LT';
// Kata penanda yang mendahului jam tanpa label ("pukul 0800", "sampai 10.00"); tanda hubung juga, tetapi hanya untuk jam berpemisah.
const KEY = '(?:pukul|pkl\\.?|jam|sampai|s\\.?\\s?d\\.?|hingga|dari|until|from|to|at)';

interface Tok {
  start: number;
  end: number;
  h: number;
  m: number;
  zone?: string; // label di teks (WIB/WITA/WIT/UTC/GMT/Z/LT), huruf besar
}

// Semua jam di narasi, berlabel atau tidak (yang tak berlabel hanya bila didahului kata penanda), berurutan menurut posisi.
function clockTokens(text: string): Tok[] {
  const toks = new Map<number, Tok>();
  for (const m of text.matchAll(new RegExp('\\b' + CLOCK + '\\s*(' + ZONES + ')\\b', 'gi')))
    toks.set(m.index ?? 0, { start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, h: Number(m[1] ?? m[3]), m: Number(m[2] ?? m[4]), zone: m[5].toUpperCase() });
  for (const m of text.matchAll(new RegExp('(?:\\b' + KEY + '\\s*|[-–]\\s*)(' + CLOCK + ')', 'gi'))) {
    const clock = m[1];
    const start = (m.index ?? 0) + m[0].length - clock.length;
    const prefix = m[0].slice(0, m[0].length - clock.length).trim();
    if (toks.has(start) || (m[2] === undefined && /^[-–]/.test(prefix))) continue;
    toks.set(start, { start, end: start + clock.length, h: Number(m[2] ?? m[4]), m: Number(m[3] ?? m[5]), });
  }
  return [...toks.values()].sort((a, b) => a.start - b.start);
}

// Zona lokal (WIB/WITA/WIT) yang berlaku untuk sebuah jam: labelnya sendiri; bila tak berlabel dan pewarisan berlaku, zona jam berlabel lokal terdekat di narasi yang sama
// (lebih dulu yang mendahului, lalu yang mengikuti). Aturan AirNav: bila ada zona di salah satu jam, jam lain di narasi itu mengikutinya;
// bila tidak ada label zona sama sekali, jam dianggap UTC apa adanya (undefined).
function localZone(at: number, own: string | undefined, toks: Tok[], inherit: boolean): string | undefined {
  if (own) return OFFSET[own] ? own : undefined;
  if (!inherit) return undefined;
  const locals = toks.filter((t) => t.zone && OFFSET[t.zone]);
  return locals.filter((t) => t.start < at).pop()?.zone ?? locals.find((t) => t.start > at)?.zone;
}

// Pewarisan tidak berlaku bila narasi menulis UTC dan padanan lokalnya berdampingan: ada jam berlabel UTC/GMT/Z, atau pola "Jam 2300 (08.00 WIT)" (UTC tanpa label diikuti padanan lokal dalam kurung).
// Diukur ke dataset: tanpa pengecualian ini 7 narasi nyata salah dikonversi.
function canInherit(text: string, toks: Tok[]): boolean {
  if (toks.some((t) => t.zone && !OFFSET[t.zone] && t.zone !== 'LT')) return false;
  return !new RegExp('\\d\\s*\\(\\s*' + CLOCK + '\\s*(?:WITA|WIB|WIT)\\b', 'i').test(text);
}

// Menambahkan konversi UTC deterministik di samping jam yang berzona lokal, mis. "03.00 WIB" -> "03.00 WIB [UTC 2000, tanggal -1 hari]".
// Jam tak berlabel di narasi yang sama dengan jam berlabel mengikuti zona itu: "[UTC 0300, zona WIB ikut jam berlabel]".
// Jam tanpa label sama sekali tidak disentuh (dianggap UTC). Hanya untuk prompt, teks asli pengguna tidak diubah.
export function annotateLocalTimes(text: string): string {
  const toks = clockTokens(text);
  const inherit = canInherit(text, toks);
  let out = text;
  for (const t of [...toks].reverse()) {
    const zone = localZone(t.start, t.zone, toks, inherit);
    if (!zone) continue;
    let mins = t.h * 60 + t.m - OFFSET[zone] * 60;
    const shift = mins < 0 ? ', tanggal -1 hari' : '';
    if (mins < 0) mins += 1440;
    const utc = `${String(Math.floor(mins / 60)).padStart(2, '0')}${String(mins % 60).padStart(2, '0')}`;
    const note = t.zone ? ` [UTC ${utc}${shift}]` : ` [UTC ${utc}${shift}, zona ${zone} ikut jam berlabel]`;
    out = out.slice(0, t.end) + note + out.slice(t.end);
  }
  return out;
}

const MONTHS = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'];
const EN_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const monthIndex = (name: string) => (MONTHS.indexOf(name.toLowerCase()) >= 0 ? MONTHS.indexOf(name.toLowerCase()) : EN_MONTHS.indexOf(name.toLowerCase()));

// "DD <bulan> YYYY [pukul] HH.MM [zona]" pada teks -> stempel UTC YYMMDDHHMM untuk yang berzona lokal (label sendiri atau ikut jam berlabel lain).
function localStamps(text: string): { stamp: string; index: number }[] {
  const toks = clockTokens(text);
  const inherit = canInherit(text, toks);
  const re = new RegExp('\\b(\\d{1,2})\\s+([a-z]+)\\s+(\\d{4})\\s*,?\\s*(?:pukul|jam|at)?\\s*(' + CLOCK + ')(?:\\s*(' + ZONES + ')\\b)?', 'gi');
  const out: { stamp: string; index: number }[] = [];
  for (const m of text.matchAll(re)) {
    const mo = monthIndex(m[2]);
    if (mo < 0) continue;
    const pos = (m.index ?? 0) + m[0].lastIndexOf(m[4]);
    const zone = localZone(pos, m[9]?.toUpperCase(), toks, inherit);
    if (!zone) continue;
    const d = new Date(Date.UTC(Number(m[3]), mo, Number(m[1]), Number(m[5] ?? m[7]), Number(m[6] ?? m[8])) - OFFSET[zone] * 3600_000);
    const p = (n: number) => String(n).padStart(2, '0');
    out.push({ stamp: `${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`, index: m.index ?? 0 });
  }
  return out;
}

export function expectedUtcStamps(text: string): string[] {
  return localStamps(text).map((l) => l.stamp);
}

// Stempel yang diharapkan per item. Dengan dua tanggal+jam berzona: awal = B), akhir = C). Dengan satu saja: bila itu tanggal terakhir dari dua tanggal di narasi, ia jam akhir (C), selain itu B).
export function expectedUtcPlan(text: string): { B?: string; C?: string } {
  const l = localStamps(text);
  if (!l.length) return {};
  if (l.length > 1) return { B: l[0].stamp, C: l[l.length - 1].stamp };
  const dates = [...text.matchAll(/\b\d{1,2}\s+([a-z]+)\s+\d{4}/gi)].filter((m) => monthIndex(m[1]) >= 0).map((m) => m.index ?? 0);
  return dates.length >= 2 && l[0].index === dates[dates.length - 1] ? { C: l[0].stamp } : { B: l[0].stamp };
}
