import { readFileSync } from 'fs';
import { TypeDoc, computeTypes, conditionLabel, impactOf, parseQ, subjectLabel } from './types';

const T0 = Date.UTC(2025, 0, 1);
const at = (h: number) => new Date(T0 + h * 3_600_000);
const doc = (formNo: string, airport: string, status: string, q: string | null, e: string, h = 0): TypeDoc => ({
  formNo, airport, originator: 'o1', status, createdAt: at(h),
  versions: [{ generated: q ? `Q) WIIF/${q}/IV/NBO/A/000/999/0616S10653E005\nA) ${airport}\nE) ${e}` : '[MOCK] tanpa kode Q' }],
});
const DOCS = [
  doc('1', 'WIHH', 'APPROVED_BY_NOF', 'QMRLC', 'RWY 06/24 CLSD DUE TO WIP', 0),
  doc('2', 'WIHH', 'REJECTED', 'QMRHW', 'RWY 06/24\nWIP', 24),
  doc('3', 'WADD', 'UNDER_ATS', 'QMXLC', 'TWY A CLSD', 48),
  doc('4', 'WADD', 'UNDER_PIA', 'QLPAS', 'PAPI RWY 24 U/S', 72),
  doc('5', 'WIHH', 'UNDER_ATS', null, '', 96),
  doc('6', 'WAAA', 'UNDER_NOF', 'QFAAH', 'AD HOURS', 120),
];

describe('parseQ', () => {
  it('memecah kode Q menjadi kelompok, subjek, kondisi', () => {
    expect(parseQ('Q) WIIF/QMRLC/IV/NBO/A/000/999/0616S10653E005')).toEqual({ qcode: 'QMRLC', group: 'M', subject: 'MR', condition: 'LC' });
    expect(parseQ('Q) WAAF/QOBCE/IV/M/AE/000/999/0212N11836E005')).toMatchObject({ group: 'O', subject: 'OB', condition: 'CE' });
    expect(parseQ('tanpa kode')).toBeNull();
    expect(parseQ(undefined)).toBeNull();
  });
});

describe('computeTypes', () => {
  const { report: r, rows } = computeTypes(DOCS, { now: at(130) });

  it('menghitung total, terbaca, dan tanpa kode Q', () => {
    expect([r.total, r.coded, r.uncoded]).toEqual([6, 5, 1]);
    expect(rows).toHaveLength(5);
  });

  it('kelompok terurut menurut jumlah, lengkap dengan nama, persentase, dan status akhir', () => {
    expect(r.groups.map((g) => [g.group, g.n])).toEqual([['M', 3], ['F', 1], ['L', 1]]);
    expect(r.groups[0]).toMatchObject({ name: 'Area pergerakan dan pendaratan', share: 0.6, approved: 1, rejected: 1 });
    expect(r.groups.reduce((a, g) => a + g.n, 0)).toBe(r.coded);
  });

  it('subjek dan kondisi bertingkat dengan arti dari contoh dataset', () => {
    const m = r.groups[0];
    expect(m.subjects.map((s) => [s.code, s.label, s.n])).toEqual([['MR', 'Runway', 2], ['MX', 'Taxiway', 1]]);
    expect(m.subjects[0].conditions).toEqual([{ code: 'HW', label: 'Ada pekerjaan', n: 1 }, { code: 'LC', label: 'Ditutup', n: 1 }]);
    const f = r.groups.find((g) => g.group === 'F')!;
    expect(f.subjects[0]).toMatchObject({ code: 'FA', label: 'Bandara (aerodrome)' });
    expect(f.subjects[0].conditions[0]).toEqual({ code: 'AH', label: 'Jam layanan berubah', n: 1 });
  });

  it('kondisi menyeluruh', () => {
    expect(r.conditions.map((c) => [c.code, c.n])).toEqual([['LC', 2], ['AH', 1], ['AS', 1], ['HW', 1]]);
    expect(r.conditions[0].share).toBeCloseTo(0.4);
  });

  it('tren per hari memuat semua kelompok tanpa celah', () => {
    expect(r.granularity).toBe('day');
    expect(r.trend.keys).toEqual(['M', 'F', 'L']);
    expect(r.trend.series).toHaveLength(6);
    expect(r.trend.series[0]).toEqual({ period: '2025-01-01', counts: { M: 1, F: 0, L: 0 } });
    expect(r.trend.series[3].counts).toEqual({ M: 0, F: 0, L: 1 });
  });

  it('matriks bandara x kelompok', () => {
    expect(r.matrix.rows.map((x) => [x.airport, x.total])).toEqual([['WADD', 2], ['WIHH', 2], ['WAAA', 1]]);
    expect(r.matrix.rows[0].counts).toEqual({ M: 1, F: 0, L: 1 });
  });

  it('kode kondisi dikelompokkan menjadi dampak operasional', () => {
    expect(['LC', 'AS', 'AU'].map(impactOf)).toEqual(['CLOSED', 'CLOSED', 'CLOSED']);
    expect(['HW', 'LT', 'CM', 'CG', 'AH'].map(impactOf)).toEqual(['LIMITED', 'LIMITED', 'LIMITED', 'LIMITED', 'LIMITED']);
    expect(['AK', 'AG', 'CC'].map(impactOf)).toEqual(['NORMAL', 'NORMAL', 'NORMAL']);
    expect(['XX', 'CE', 'ZZ'].map(impactOf)).toEqual(['OTHER', 'OTHER', 'OTHER']);
  });

  it('ringkasan dampak, silang subjek x dampak, dan rincian bandara konsisten', () => {
    expect(r.impact.map((i) => [i.key, i.n])).toEqual([['CLOSED', 3], ['LIMITED', 2], ['NORMAL', 0], ['OTHER', 0]]);
    expect(r.impact.reduce((a, i) => a + i.n, 0)).toBe(r.coded);
    const mr = r.impactMatrix.find((x) => x.subject === 'MR')!;
    expect([mr.label, mr.total, mr.counts.CLOSED, mr.counts.LIMITED]).toEqual(['Runway', 2, 1, 1]);
    expect(r.impactMatrix.reduce((a, x) => a + x.total, 0)).toBe(r.coded);
    expect(r.airportDetail.map((a) => [a.airport, a.total])).toEqual([['WADD', 2], ['WIHH', 2], ['WAAA', 1]]);
    const hh = r.airportDetail.find((a) => a.airport === 'WIHH')!;
    expect(hh.impact).toEqual({ CLOSED: 1, LIMITED: 1, NORMAL: 0, OTHER: 0 });
    expect(hh.subjects.map((x) => [x.code, x.n])).toEqual([['MR', 2]]);
    expect(r.insights.join('\n')).toContain('Runway: 1 ditutup, 1 dengan pembatasan atau pekerjaan, dari 2 NOTAM runway.');
  });

  it('baris data menyimpan isi item E satu baris', () => {
    expect(rows.find((x) => x.formNo === '2')?.text).toBe('RWY 06/24 WIP');
    expect(rows.find((x) => x.formNo === '1')).toMatchObject({ qcode: 'QMRLC', group: 'M', subject: 'MR', condition: 'LC', airport: 'WIHH' });
  });

  it('insight konsisten dengan angka', () => {
    const t = r.insights.join('\n');
    expect(t).toContain('6 NOTAM pada periode ini; 5 memiliki kode Q yang terbaca dan 1 tidak.');
    expect(t).toContain('Jenis terbanyak: Area pergerakan dan pendaratan, 3 NOTAM (60%), terutama Runway (2).');
    expect(t).toContain('Kondisi paling umum: Ditutup (40%).');
  });

  it('seri bulanan dan kelompok "Lain" untuk lebih dari lima kelompok', () => {
    const many = ['QMRLC', 'QLPAS', 'QFAAH', 'QNMAS', 'QILAS', 'QOBCE', 'QSAAS'].map((q, i) => doc(String(i), 'WIHH', 'UNDER_ATS', q, 'x', i * 24 * 20));
    const { report } = computeTypes(many, { now: at(24 * 160) });
    expect(report.granularity).toBe('month');
    expect(report.trend.keys).toHaveLength(6);
    expect(report.trend.keys[5]).toBe('Lain');
    expect(report.trend.series.reduce((a, s) => a + Object.values(s.counts).reduce((x, y) => x + y, 0), 0)).toBe(7);
  });

  it('tanpa data', () => {
    const e = computeTypes([], { now: at(0) }).report;
    expect(e).toMatchObject({ total: 0, coded: 0, uncoded: 0, groups: [], conditions: [] });
    expect(e.insights).toEqual(['Belum ada pengajuan pada periode ini.']);
  });
});

describe('nama subjek & kondisi lengkap', () => {
  const icao = JSON.parse(readFileSync('data/icao-notam-code.json', 'utf8'));
  it('semua kode ICAO punya nama Indonesia', () => {
    for (const k of Object.keys(icao.subject)) expect(subjectLabel(k)).toBeTruthy();
    for (const k of Object.keys(icao.condition)) expect(conditionLabel(k)).toBeTruthy();
  });
  it('nama dari dataset AirNav tetap didahulukan', () => {
    expect(subjectLabel('MR')).toBe('Runway');
    expect(conditionLabel('LC')).toBe('Ditutup');
  });
});
