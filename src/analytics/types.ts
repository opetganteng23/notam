import { findAirport } from '../master/airports';

// Nama kelompok mengikuti pengelompokan kode Q ICAO (huruf pertama setelah "Q").
export const GROUP_NAME: Record<string, string> = {
  A: 'Organisasi ruang udara', C: 'Komunikasi dan radar', F: 'Fasilitas dan layanan', G: 'Navigasi satelit (GNSS)',
  I: 'Sistem pendaratan instrumen (ILS)', L: 'Penerangan bandara', M: 'Area pergerakan dan pendaratan', N: 'Navigasi radio',
  O: 'Informasi lain dan rintangan', P: 'Prosedur lalu lintas udara', R: 'Pembatasan ruang udara', S: 'Layanan lalu lintas udara',
  W: 'Peringatan navigasi', X: 'Lainnya',
};
// Arti subjek dan kondisi disimpulkan dari contoh item E di dataset (qcode-kandidat-dari-dataset.csv), BUKAN tabel resmi AirNav.
// Kode yang contohnya tidak tegas sengaja tidak diberi arti dan tampil apa adanya.
export const SUBJECT_NAME: Record<string, string> = { MR: 'Runway', FA: 'Bandara (aerodrome)', MX: 'Taxiway', MP: 'Stand pesawat', LP: 'PAPI', MW: 'Strip / bahu runway', NM: 'VOR/DME', MN: 'Apron', LT: 'Lampu threshold (RTIL)', IL: 'ILS localizer', NB: 'NDB', LE: 'Lampu tepi runway', LA: 'Lampu pendekatan (approach)', LI: 'Lampu ujung runway (REIL)', OB: 'Rintangan (obstacle)', FF: 'Pemadam kebakaran (RFFS)', IG: 'ILS glide path', LY: 'Lampu tepi taxiway', CB: 'ADS-B', NV: 'VOR', MT: 'Threshold runway', IC: 'ILS', IM: 'Marker (middle marker)', SF: 'Layanan informasi penerbangan (AFIS)', MU: 'Area putar (turn pad)', CS: 'Radar (MSSR)', PD: 'Prosedur keberangkatan (SID)', SP: 'Layanan radar pendekatan', LJ: 'RTIL', SA: 'ATIS', PA: 'Prosedur kedatangan (STAR)', PI: 'Prosedur pendekatan instrumen', LC: 'Lampu garis tengah runway', LF: 'Lampu kilat berurutan', ND: 'DME', ID: 'ILS/DME', FM: 'Layanan meteorologi', MC: 'Clearway', LB: 'Beacon bandara (ABN)', MM: 'Marka runway', MD: 'Jarak deklarasi (declared distance)', CD: 'Data link (CPDLC)', CA: 'Komunikasi udara-darat (HF)', MH: 'Arresting gear', RA: 'Pencadangan ruang udara', WU: 'Pesawat tanpa awak (UAV)' };
export const CONDITION_NAME: Record<string, string> = { AS: 'Tidak dapat digunakan', LC: 'Ditutup', XX: 'Lainnya (teks bebas)', HW: 'Ada pekerjaan', AK: 'Kembali beroperasi normal', AH: 'Jam layanan berubah', LT: 'Terbatas', CM: 'Dipindahkan (displaced)', CE: 'Didirikan', TT: 'Trigger NOTAM', CH: 'Berubah', AU: 'Tidak tersedia', AG: 'Beroperasi, baru diperiksa di darat', CG: 'Diturunkan (downgraded)', HX: 'Konsentrasi burung', AW: 'Ditarik (withdrawn)', CC: 'Selesai', LW: 'Akan berlangsung', CT: 'Sedang diuji', CS: 'Terpasang', CN: 'NOTAM baru menyusul' };

// Dampak operasional, dikelompokkan dari kode kondisi Q (dua huruf terakhir). Pengelompokan ini dibuat sistem agar mudah dibaca, BUKAN istilah resmi AirNav.
export type Impact = 'CLOSED' | 'LIMITED' | 'NORMAL' | 'OTHER';
export const IMPACTS: Impact[] = ['CLOSED', 'LIMITED', 'NORMAL', 'OTHER'];
export const IMPACT_NAME: Record<Impact, string> = { CLOSED: 'Tidak bisa dipakai', LIMITED: 'Dipakai dengan pembatasan', NORMAL: 'Kembali normal', OTHER: 'Lainnya' };
const IMPACT_OF: Record<string, Impact> = {
  LC: 'CLOSED', AS: 'CLOSED', AU: 'CLOSED',
  HW: 'LIMITED', LT: 'LIMITED', CM: 'LIMITED', CG: 'LIMITED', AH: 'LIMITED',
  AK: 'NORMAL', AG: 'NORMAL', CC: 'NORMAL',
};
export const impactOf = (condition: string): Impact => IMPACT_OF[condition] ?? 'OTHER';
const zeroImpact = (): Record<Impact, number> => ({ CLOSED: 0, LIMITED: 0, NORMAL: 0, OTHER: 0 });

export interface TypeDoc {
  _id?: unknown; formNo: string; airport: string; originator: string; status: string; createdAt: Date;
  versions: { freeText?: string; generated?: string }[];
}

export interface TypeRow {
  id: string; formNo: string; createdAt: Date; airport: string; originator: string; status: string;
  qcode: string; group: string; subject: string; condition: string; text: string; // text = isi item E
  prompt: string; full: string; // pesan asli dan NOTAM lengkap (Q sampai E)
}

export interface TypesReport {
  period: { from: string | null; to: string | null; generatedAt: string; airport: string | null; status: string | null };
  total: number; coded: number; uncoded: number;
  groups: {
    group: string; name: string; n: number; share: number; approved: number; rejected: number;
    subjects: { code: string; label: string | null; n: number; conditions: { code: string; label: string | null; n: number }[] }[];
  }[];
  conditions: { code: string; label: string | null; n: number; share: number }[];
  granularity: 'day' | 'month';
  trend: { keys: string[]; series: { period: string; counts: Record<string, number> }[] };
  matrix: { groups: string[]; rows: { airport: string; name: string; counts: Record<string, number>; total: number }[] };
  // Dampak operasional (dari kode kondisi), silang subjek x dampak (10 subjek teratas), dan rincian bandara sampai subjek.
  impact: { key: Impact; label: string; n: number; share: number }[];
  impactMatrix: { subject: string; label: string | null; group: string; counts: Record<Impact, number>; total: number }[];
  airportDetail: { airport: string; name: string; total: number; impact: Record<Impact, number>; subjects: { code: string; label: string | null; n: number; impact: Record<Impact, number> }[] }[];
  insights: string[];
}

const Q = /Q\)\s*\w{4}\/Q([A-Z])([A-Z])([A-Z]{2})/;
const E_LINE = /^\s*E\)\s*([\s\S]*)$/m;
const pct = (r: number) => `${Math.round(r * 100)}%`;
const label = (m: Record<string, string>, k: string) => m[k] ?? null;

export function parseQ(generated?: string) {
  const m = Q.exec(generated ?? '');
  if (!m) return null;
  return { qcode: `Q${m[1]}${m[2]}${m[3]}`, group: m[1], subject: `${m[1]}${m[2]}`, condition: m[3] };
}

export function computeTypes(docs: TypeDoc[], o: { from?: Date; to?: Date; airport?: string; status?: string; now?: Date } = {}): { report: TypesReport; rows: TypeRow[] } {
  const now = o.now ?? new Date();
  const rows: TypeRow[] = [];
  let uncoded = 0;
  for (const d of docs) {
    const lastV = d.versions[d.versions.length - 1];
    const gen = lastV?.generated;
    const q = parseQ(gen);
    if (!q) { uncoded++; continue; }
    const e = E_LINE.exec(gen ?? '')?.[1]?.trim().replace(/\s+/g, ' ') ?? '';
    rows.push({ id: String(d._id ?? d.formNo), formNo: d.formNo, createdAt: d.createdAt, airport: d.airport, originator: d.originator, status: d.status, ...q, text: e, prompt: lastV?.freeText ?? '', full: gen ?? '' });
  }
  const coded = rows.length;

  const groups = new Map<string, { n: number; approved: number; rejected: number; subjects: Map<string, { n: number; conds: Map<string, number> }> }>();
  const conds = new Map<string, number>();
  for (const r of rows) {
    const g = groups.get(r.group) ?? { n: 0, approved: 0, rejected: 0, subjects: new Map() };
    g.n++;
    if (r.status === 'APPROVED_BY_NOF') g.approved++;
    if (r.status === 'REJECTED') g.rejected++;
    const s = g.subjects.get(r.subject) ?? { n: 0, conds: new Map() };
    s.n++;
    s.conds.set(r.condition, (s.conds.get(r.condition) ?? 0) + 1);
    g.subjects.set(r.subject, s);
    groups.set(r.group, g);
    conds.set(r.condition, (conds.get(r.condition) ?? 0) + 1);
  }
  const byN = <T,>(a: [string, T][], f: (v: T) => number) => a.sort((x, y) => f(y[1]) - f(x[1]) || x[0].localeCompare(y[0]));
  const groupList = byN([...groups.entries()], (v) => v.n).map(([g, v]) => ({
    group: g, name: label(GROUP_NAME, g) ?? `Kelompok ${g}`, n: v.n, share: coded ? v.n / coded : 0, approved: v.approved, rejected: v.rejected,
    subjects: byN([...v.subjects.entries()], (s) => s.n).map(([code, s]) => ({
      code, label: label(SUBJECT_NAME, code), n: s.n,
      conditions: byN([...s.conds.entries()], (n) => n).map(([c, n]) => ({ code: c, label: label(CONDITION_NAME, c), n })),
    })),
  }));
  const condList = byN([...conds.entries()], (n) => n).map(([code, n]) => ({ code, label: label(CONDITION_NAME, code), n, share: coded ? n / coded : 0 }));

  // Tren: 5 kelompok teratas + "Lain" (harian bila <= 62 hari, selain itu bulanan)
  const times = rows.map((r) => +new Date(r.createdAt));
  const start = o.from ?? (times.length ? new Date(Math.min(...times)) : now);
  const end = o.to ?? now;
  const granularity: 'day' | 'month' = (+end - +start) / 86_400_000 <= 62 ? 'day' : 'month';
  const key = (d: Date) => d.toISOString().slice(0, granularity === 'day' ? 10 : 7);
  const topKeys = groupList.slice(0, 5).map((g) => g.group);
  const keys = groupList.length > 5 ? [...topKeys, 'Lain'] : topKeys;
  const buckets = new Map<string, Record<string, number>>();
  if (coded) {
    const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), granularity === 'day' ? start.getUTCDate() : 1));
    const last = new Date(Math.max(+end, ...times));
    while (+cur <= +last) {
      buckets.set(key(cur), Object.fromEntries(keys.map((k) => [k, 0])));
      if (granularity === 'day') cur.setUTCDate(cur.getUTCDate() + 1); else cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
    for (const r of rows) {
      const b = buckets.get(key(new Date(r.createdAt)));
      if (b) { const k = topKeys.includes(r.group) ? r.group : 'Lain'; b[k]++; }
    }
  }

  // Matriks bandara x kelompok (8 bandara teratas)
  const byAirport = new Map<string, TypeRow[]>();
  for (const r of rows) byAirport.set(r.airport, [...(byAirport.get(r.airport) ?? []), r]);
  const matrix = {
    groups: topKeys,
    rows: byN([...byAirport.entries()], (v) => v.length).slice(0, 8).map(([airport, rs]) => ({
      airport, name: findAirport(airport)?.name ?? '', total: rs.length,
      counts: Object.fromEntries(topKeys.map((g) => [g, rs.filter((r) => r.group === g).length])),
    })),
  };

  // Dampak operasional: total, silang subjek x dampak, dan rincian per bandara (8 teratas) sampai subjek.
  const impactTotal = zeroImpact();
  const bySubject = new Map<string, { group: string; counts: Record<Impact, number>; total: number }>();
  for (const r of rows) {
    const im = impactOf(r.condition);
    impactTotal[im]++;
    const sj = bySubject.get(r.subject) ?? { group: r.group, counts: zeroImpact(), total: 0 };
    sj.counts[im]++;
    sj.total++;
    bySubject.set(r.subject, sj);
  }
  const impact = IMPACTS.map((key) => ({ key, label: IMPACT_NAME[key], n: impactTotal[key], share: coded ? impactTotal[key] / coded : 0 }));
  const impactMatrix = byN([...bySubject.entries()], (v) => v.total).slice(0, 10).map(([subject, v]) => ({ subject, label: label(SUBJECT_NAME, subject), group: v.group, counts: v.counts, total: v.total }));
  const airportDetail = byN([...byAirport.entries()], (v) => v.length).slice(0, 8).map(([airport, rs]) => {
    const subj = new Map<string, { n: number; impact: Record<Impact, number> }>();
    const tot = zeroImpact();
    for (const r of rs) {
      const im = impactOf(r.condition);
      tot[im]++;
      const x = subj.get(r.subject) ?? { n: 0, impact: zeroImpact() };
      x.n++;
      x.impact[im]++;
      subj.set(r.subject, x);
    }
    return {
      airport, name: findAirport(airport)?.name ?? '', total: rs.length, impact: tot,
      subjects: byN([...subj.entries()], (x) => x.n).map(([code, x]) => ({ code, label: label(SUBJECT_NAME, code), n: x.n, impact: x.impact })),
    };
  });

  const report: TypesReport = {
    period: { from: o.from?.toISOString() ?? null, to: o.to?.toISOString() ?? null, generatedAt: now.toISOString(), airport: o.airport ?? null, status: o.status ?? null },
    total: docs.length, coded, uncoded, groups: groupList, conditions: condList, granularity,
    trend: { keys, series: [...buckets.entries()].map(([period, counts]) => ({ period, counts })) },
    matrix, impact, impactMatrix, airportDetail, insights: [],
  };
  report.insights = typeInsights(report);
  return { report, rows };
}

export function typeInsights(r: TypesReport): string[] {
  if (!r.total) return ['Belum ada pengajuan pada periode ini.'];
  const out = [`${r.total} NOTAM pada periode ini; ${r.coded} memiliki kode Q yang terbaca${r.uncoded ? ` dan ${r.uncoded} tidak` : ''}.`];
  const g = r.groups[0];
  if (!g) return out;
  const s = g.subjects[0];
  out.push(`Jenis terbanyak: ${g.name}, ${g.n} NOTAM (${pct(g.share)})${s ? `, terutama ${s.label ?? s.code} (${s.n})` : ''}.`);
  const top3 = r.groups.slice(0, 3).reduce((a, x) => a + x.share, 0);
  if (r.groups.length > 3) out.push(`Tiga kelompok teratas mencakup ${pct(top3)} dari seluruh NOTAM.`);
  const c = r.conditions[0];
  if (c) out.push(`Kondisi paling umum: ${c.label ?? c.code} (${pct(c.share)}).`);
  const closed = r.impact?.find((i) => i.key === 'CLOSED');
  const limited = r.impact?.find((i) => i.key === 'LIMITED');
  if (closed && limited && (closed.n || limited.n)) out.push(`Dampak operasional: ${closed.n} NOTAM berarti tidak bisa dipakai (${pct(closed.share)}) dan ${limited.n} dipakai dengan pembatasan (${pct(limited.share)}).`);
  const rw = r.impactMatrix?.find((x) => x.subject === 'MR');
  if (rw && rw.total) out.push(`Runway: ${rw.counts.CLOSED} ditutup, ${rw.counts.LIMITED} dengan pembatasan atau pekerjaan, dari ${rw.total} NOTAM runway.`);
  const m = r.matrix.rows[0];
  if (m) out.push(`Bandara dengan NOTAM terbanyak: ${m.airport}${m.name ? ` (${m.name})` : ''}, ${m.total} NOTAM.`);
  out.push('Kode Q berasal dari hasil susunan AI dan belum tentu dikoreksi peninjau; arti kode disimpulkan dari contoh dataset, bukan tabel resmi AirNav.');
  return out;
}
