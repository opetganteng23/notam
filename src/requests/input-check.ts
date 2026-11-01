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

// Ada tanggal tertulis: "9 November", "1 Nopember", "09/11/2026", atau "2611090100". Tanpa tanggal, model terpaksa menebak B).
const MONTH_WORDS = 'januari|pebruari|februari|maret|april|mei|juni|juli|agustus|september|oktober|nopember|november|desember|january|february|march|may|june|july|august|october|december|jan|feb|peb|mar|apr|jun|jul|agu|agt|aug|sep|sept|okt|oct|nov|nop|des|dec';
const ANY_DATE = new RegExp(String.raw`\b\d{1,2}\s*(?:-\s*\d{1,2}\s*)?(?:${MONTH_WORDS})\b|\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{10}\b`, 'i');
export const hasDate = (text: string): boolean => ANY_DATE.test(text);
