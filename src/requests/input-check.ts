const MONTHS = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'];
const DATE = new RegExp(String.raw`(\d{1,2})\s+(${MONTHS.join('|')})\s+(\d{4})(?:[^\d]{0,12}?(\d{1,2})[.:]?(\d{2}))?`, 'gi');

// Waktu-waktu bertanggal lengkap di teks, berurutan seperti ditulis ("9 November 2026 pukul 08.00").
export function writtenTimes(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(DATE)) {
    const mon = MONTHS.indexOf(m[2].toLowerCase());
    const h = m[4] !== undefined ? Number(m[4]) : 0, min = m[5] !== undefined ? Number(m[5]) : 0;
    if (h > 23 || min > 59) continue;
    out.push(Date.UTC(Number(m[3]), mon, Number(m[1]), h, min));
  }
  return out;
}

// Tanggal selesai (yang terakhir ditulis) lebih awal dari tanggal mulai (yang pertama ditulis).
export const endBeforeStart = (text: string): boolean => {
  const t = writtenTimes(text);
  return t.length >= 2 && t[t.length - 1] < t[0];
};
