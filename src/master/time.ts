const OFFSET: Record<string, number> = { WIB: 7, WITA: 8, WIT: 9 };

// Menambahkan konversi UTC deterministik di samping jam berlabel zona, mis. "03.00 WIB" -> "03.00 WIB [UTC 2000, tanggal -1 hari]".
// Jam tanpa label tidak disentuh: di dataset, mayoritas jam tanpa label ditulis apa adanya di B)/C), jadi tidak bisa dianggap lokal.
// Hanya untuk prompt, teks asli pengguna tidak diubah.
export function annotateLocalTimes(text: string): string {
  return text.replace(/\b([01]?\d|2[0-3])[.:]([0-5]\d)\s*(WITA|WIB|WIT)\b/gi, (all, h, m, label) => {
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

// Pasangan "DD <bulan> YYYY [pukul] HH.MM <zona>" pada teks -> stempel UTC YYMMDDHHMM yang seharusnya muncul di B)/C).
// Hanya mengenali pola tanggal+jam berlabel zona; selain itu tidak ada yang diperiksa.
export function expectedUtcStamps(text: string): string[] {
  const re = /\b(\d{1,2})\s+([a-z]+)\s+(\d{4})\s*,?\s*(?:pukul|jam|at)?\s*([01]?\d|2[0-3])[.:]([0-5]\d)\s*(WITA|WIB|WIT)\b/gi;
  const out: string[] = [];
  for (const m of text.matchAll(re)) {
    const name = m[2].toLowerCase();
    const mo = MONTHS.indexOf(name) >= 0 ? MONTHS.indexOf(name) : EN_MONTHS.indexOf(name);
    if (mo < 0) continue;
    const offset = OFFSET[m[6].toUpperCase()];
    const d = new Date(Date.UTC(Number(m[3]), mo, Number(m[1]), Number(m[4]), Number(m[5])) - offset * 3600_000);
    const p = (n: number) => String(n).padStart(2, '0');
    out.push(`${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`);
  }
  return out;
}
