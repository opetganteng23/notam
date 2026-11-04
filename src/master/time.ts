const OFFSET: Record<string, number> = { WIB: 7, WITA: 8, WIT: 9 };

// Jam berlabel zona: "03.00 WIB", "03:00 WIB", atau 4 digit tanpa pemisah "0300 WIB" / "2200 WIB".
// Tanpa pemisah wajib tepat 4 digit (HHMM) agar angka lain, mis. tahun "2026", tidak terbaca sebagai jam.
const CLOCK = '(?:([01]?\\d|2[0-3])[.:]([0-5]\\d)|([01]\\d|2[0-3])([0-5]\\d))';
const CLOCK_ZONE = new RegExp('\\b' + CLOCK + '\\s*(WITA|WIB|WIT)\\b', 'gi');

// Menambahkan konversi UTC deterministik di samping jam berlabel zona, mis. "03.00 WIB" -> "03.00 WIB [UTC 2000, tanggal -1 hari]".
// Jam tanpa label tidak disentuh: di dataset, mayoritas jam tanpa label ditulis apa adanya di B)/C), jadi tidak bisa dianggap lokal.
// Hanya untuk prompt, teks asli pengguna tidak diubah.
export function annotateLocalTimes(text: string): string {
  return text.replace(CLOCK_ZONE, (all, h1, m1, h2, m2, label) => {
    const h = h1 ?? h2;
    const m = m1 ?? m2;
    const offset = OFFSET[label.toUpperCase()];
    let mins = Number(h) * 60 + Number(m) - offset * 60;
    const shift = mins < 0 ? ', tanggal -1 hari' : '';
    if (mins < 0) mins += 1440;
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    return `${all} [UTC ${hh}${String(mins % 60).padStart(2, '0')}${shift}]`;
  });
}

const MONTHS = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'];
const EN_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function labeledStamps(text: string): { stamp: string; index: number }[] {
  const re = new RegExp('\\b(\\d{1,2})\\s+([a-z]+)\\s+(\\d{4})\\s*,?\\s*(?:pukul|jam|at)?\\s*' + CLOCK + '\\s*(WITA|WIB|WIT)\\b', 'gi');
  const out: { stamp: string; index: number }[] = [];
  for (const m of text.matchAll(re)) {
    const name = m[2].toLowerCase();
    const mo = MONTHS.indexOf(name) >= 0 ? MONTHS.indexOf(name) : EN_MONTHS.indexOf(name);
    if (mo < 0) continue;
    const hour = Number(m[4] ?? m[6]);
    const min = Number(m[5] ?? m[7]);
    const offset = OFFSET[m[8].toUpperCase()];
    const d = new Date(Date.UTC(Number(m[3]), mo, Number(m[1]), hour, min) - offset * 3600_000);
    const p = (n: number) => String(n).padStart(2, '0');
    out.push({ stamp: `${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`, index: m.index ?? 0 });
  }
  return out;
}

// Pasangan "DD <bulan> YYYY [pukul] HH.MM <zona>" pada teks -> stempel UTC YYMMDDHHMM yang seharusnya muncul di B)/C).
// Hanya mengenali pola tanggal+jam berlabel zona; selain itu tidak ada yang diperiksa.
export function expectedUtcStamps(text: string): string[] {
  return labeledStamps(text).map((l) => l.stamp);
}

// Stempel yang diharapkan per item. Satu jam berlabel belum tentu jam awal: bila narasi memuat dua tanggal dan yang berlabel adalah yang terakhir,
// itu jam akhir (C), dan B) tidak disentuh (jam tanpa label ditulis apa adanya sebagai UTC).
export function expectedUtcPlan(text: string): { B?: string; C?: string } {
  const l = labeledStamps(text);
  if (!l.length) return {};
  if (l.length > 1) return { B: l[0].stamp, C: l[l.length - 1].stamp };
  const dates = [...text.matchAll(/\b\d{1,2}\s+([a-z]+)\s+\d{4}/gi)].filter((m) => MONTHS.includes(m[1].toLowerCase()) || EN_MONTHS.includes(m[1].toLowerCase())).map((m) => m.index ?? 0);
  const isEnd = dates.length >= 2 && l[0].index === dates[dates.length - 1];
  return isEnd ? { C: l[0].stamp } : { B: l[0].stamp };
}

// Jam di narasi: didahului kata penanda (pukul/jam/sampai/s.d./dari/...) atau tanda hubung, dengan zona opsional.
// Tanpa pemisah (HHMM) hanya dihitung bila didahului kata penanda, bukan tanda hubung, agar angka lain tidak terbaca sebagai jam.
const KEY = '(?:pukul|pkl\\.?|jam|sampai|s\\.?\\s?d\\.?|hingga|dari|until|from|to|at)';
const CLOCK_ANY = new RegExp('(?:\\b' + KEY + '\\s*|[-–]\\s*)\\b' + CLOCK + '(?:\\s*(WITA|WIB|WIT|UTC|GMT|Z|LT)\\b)?', 'gi');

// Sebagian jam berlabel WIB/WITA/WIT tetapi jam lain di narasi tidak berlabel: yang tak berlabel ditulis apa adanya (UTC), sehingga rentang bisa terbalik tujuh jam.
// Jam tanpa label sama sekali sengaja tidak diperingatkan: di dataset 544 dari 855 narasi ber-jam begitu, dan aturan AirNav menganggapnya UTC.
export function mixedZoneClocks(text: string): { local: string[]; unlabeled: string[] } {
  const local: string[] = [];
  const unlabeled: string[] = [];
  for (const m of text.matchAll(CLOCK_ANY)) {
    const raw = m[0].trim();
    const zone = m[5];
    if (m[2] === undefined && /^[-–]/.test(raw)) continue;
    const clock = `${(m[1] ?? m[3]).padStart(2, '0')}.${m[2] ?? m[4]}`;
    if (!zone) unlabeled.push(clock);
    else if (/^(WITA|WIB|WIT)$/i.test(zone)) local.push(`${clock} ${zone.toUpperCase()}`);
  }
  return local.length && unlabeled.length ? { local, unlabeled } : { local: [], unlabeled: [] };
}
