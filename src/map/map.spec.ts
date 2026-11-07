import { MapDoc, buildPoints, canSee, parseArp, parseValidity, selectItems, timeline, toneOf, validityState } from './map';

const gen = (b: string, c: string) => `Q) WIIF/QMRLC/IV/NBO/A/000/999/0616S10653E005\nA) WIHH\nB) ${b}\nC) ${c}\nE) RWY 06/24 CLSD DUE TO MAINT`;
const NOW = new Date(Date.UTC(2026, 10, 10, 2, 0)); // 10 Nov 2026 02:00 UTC
const doc = (formNo: string, airport: string, status: string, createdAt: string, b: string, c: string, originator = 'o1'): MapDoc => ({
  formNo, airport, status, originator, createdAt: new Date(createdAt), versions: [{ generated: gen(b, c) }],
});

describe('parseArp', () => {
  it('membaca koordinat valid', () => {
    const p = parseArp('0616S10653E')!;
    expect(p.lat).toBeCloseTo(-6.2667, 3);
    expect(p.lon).toBeCloseTo(106.8833, 3);
    expect(parseArp('0107N10406E')!.lat).toBeGreaterThan(0);
  });
  it('format tidak valid dianggap tidak punya koordinat', () => {
    for (const bad of ['', 'NIL', '0352S 13833E', '0437S13847S', '0326S1403E', undefined, '9959S10653E']) expect(parseArp(bad as string)).toBeNull();
  });
});

describe('masa berlaku (B/C)', () => {
  it('membaca B dan C dalam UTC', () => {
    const v = parseValidity(gen('2611100100', '2611100500'))!;
    expect(v.from!.toISOString()).toBe('2026-11-10T01:00:00.000Z');
    expect(v.to!.toISOString()).toBe('2026-11-10T05:00:00.000Z');
    expect(v.perm).toBe(false);
  });
  it('mengenali PERM dan EST', () => {
    expect(parseValidity(gen('2611100100', 'PERM'))).toMatchObject({ perm: true, to: null });
    expect(parseValidity(gen('2611100100', '2611100500 EST'))).toMatchObject({ est: true });
  });
  it('tanggal tidak masuk akal atau tidak ada B ditolak', () => {
    expect(parseValidity(gen('2613400100', '2611100500'))).toBeNull();
    expect(parseValidity('E) TEKS SAJA')).toBeNull();
    expect(parseValidity(undefined)).toBeNull();
  });
  it('status masa berlaku terhadap waktu sekarang', () => {
    const at = (b: string, c: string) => validityState(parseValidity(gen(b, c)), NOW);
    expect(at('2611100100', '2611100500')).toBe('active');
    expect(at('2611110100', '2611110500')).toBe('upcoming');
    expect(at('2611090100', '2611090500')).toBe('expired');
    expect(at('2611090100', 'PERM')).toBe('active');
    expect(validityState(null, NOW)).toBeNull();
  });
});

describe('selectItems', () => {
  const docs = [
    doc('A', 'WIHH', 'APPROVED_BY_NOF', '2026-11-01T00:00:00Z', '2611100100', '2611100500'),
    doc('B', 'WIHH', 'UNDER_PIA', '2026-11-05T00:00:00Z', '2611200100', '2611200500', 'o2'),
    doc('C', 'WADD', 'APPROVED_BY_NOF', '2026-10-01T00:00:00Z', '2610010100', '2610010500'),
    doc('D', 'WATF', 'REJECTED', '2026-11-06T00:00:00Z', '2611060100', '2611060500'),
  ];
  const base = { by: 'created' as const, now: NOW };
  it('tanpa filter semua masuk dan penanda mine benar', () => {
    const r = selectItems(docs, base, 'o1');
    expect(r.length).toBe(4);
    expect(r.find((i) => i.formNo === 'B')!.mine).toBe(false);
    expect(r.find((i) => i.formNo === 'A')!.mine).toBe(true);
  });
  it('filter tanggal pengajuan', () => {
    const r = selectItems(docs, { ...base, from: new Date('2026-11-01T00:00:00Z'), to: new Date('2026-11-05T12:00:00Z') }, 'o1');
    expect(r.map((i) => i.formNo).sort()).toEqual(['A', 'B']);
  });
  it('filter masa berlaku memakai tumpang tindih rentang', () => {
    const r = selectItems(docs, { ...base, by: 'validity', from: new Date('2026-11-10T03:00:00Z'), to: new Date('2026-11-10T04:00:00Z') }, 'o1');
    expect(r.map((i) => i.formNo)).toEqual(['A']);
  });
  it('filter status dan state (state hanya untuk yang disetujui)', () => {
    expect(selectItems(docs, { ...base, status: 'UNDER_PIA' }, 'o1').map((i) => i.formNo)).toEqual(['B']);
    expect(selectItems(docs, { ...base, state: 'active' }, 'o1').map((i) => i.formNo)).toEqual(['A']);
    expect(selectItems(docs, { ...base, state: 'expired' }, 'o1').map((i) => i.formNo)).toEqual(['C']);
  });
  it('filter FIR memakai data bandara', () => {
    const r = selectItems(docs, { ...base, fir: 'WAAF' }, 'o1');
    expect(r.map((i) => i.formNo).sort()).toEqual(['C', 'D']); // WADD dan WATF berada di FIR WAAF
  });
  it('cuplikan E dan kode Q terbaca', () => {
    const r = selectItems(docs, base, 'o1')[0];
    expect(r.text).toBe('RWY 06/24 CLSD DUE TO MAINT');
    expect(r.qcode).toBe('QMRLC');
  });
});

describe('buildPoints dan garis waktu', () => {
  const items = selectItems([
    doc('A', 'WIHH', 'APPROVED_BY_NOF', '2026-11-01T00:00:00Z', '2611100100', '2611100500'),
    doc('B', 'WIHH', 'REJECTED', '2026-11-01T10:00:00Z', '2611100100', '2611100500'),
    doc('C', 'WADD', 'UNDER_ATS', '2026-11-02T00:00:00Z', '2611100100', '2611100500'),
    doc('D', 'WATF', 'APPROVED_BY_NOF', '2026-11-02T00:00:00Z', '2611100100', '2611100500'),
  ], { by: 'created', now: NOW }, 'o1');
  it('titik per bandara; bandara tanpa koordinat dihitung terpisah', () => {
    const r = buildPoints(items, false);
    expect(r.points.map((p) => [p.airport, p.n, p.tone])).toEqual([['WIHH', 2, 'bad'], ['WADD', 1, 'wait']]);
    expect(r.noCoord).toBe(1);
    expect(r.noCoordAirports).toBe(1);
  });
  it('mode semua bandara menambah titik kosong', () => {
    const r = buildPoints(items, true);
    expect(r.points.length).toBeGreaterThan(400);
    expect(r.points.filter((p) => p.n === 0).every((p) => p.tone === 'none')).toBe(true);
  });
  it('nada warna: merah, menunggu, hijau, draft', () => {
    expect(toneOf({ APPROVED_BY_NOF: 3 })).toBe('ok');
    expect(toneOf({ APPROVED_BY_NOF: 3, UNDER_NOF: 1 })).toBe('wait');
    expect(toneOf({ UNDER_NOF: 1, REVISION_REQUIRED: 1 })).toBe('bad');
    expect(toneOf({ DRAFT: 1 })).toBe('draft');
  });
  it('garis waktu per hari berurutan', () => {
    expect(timeline(items)).toEqual([{ day: '2026-11-01', n: 2 }, { day: '2026-11-02', n: 2 }]);
  });
});

describe('aturan akses peta (canSee)', () => {
  const o1 = { username: 'o1', role: 'ORIGINATOR' };
  it('Originator: miliknya semua status, milik orang lain hanya yang disetujui NOF', () => {
    expect(canSee(o1, { originator: 'o1', status: 'DRAFT' })).toBe(true);
    expect(canSee(o1, { originator: 'o1', status: 'UNDER_ATS' })).toBe(true);
    expect(canSee(o1, { originator: 'o2', status: 'APPROVED_BY_NOF' })).toBe(true);
    for (const s of ['DRAFT', 'UNDER_ATS', 'UNDER_PIA', 'UNDER_NOF', 'REVISION_REQUIRED', 'REJECTED']) expect(canSee(o1, { originator: 'o2', status: s })).toBe(false);
  });
  it('ATS, PIA, NOF, Admin: semua yang sudah disubmit, tidak pernah draft siapa pun', () => {
    for (const role of ['ATS', 'PIA', 'NOF', 'ADMIN']) {
      const u = { username: 'x', role };
      expect(canSee(u, { originator: 'o1', status: 'DRAFT' })).toBe(false);
      for (const s of ['UNDER_ATS', 'UNDER_PIA', 'UNDER_NOF', 'REVISION_REQUIRED', 'REJECTED', 'APPROVED_BY_NOF']) expect(canSee(u, { originator: 'o1', status: s })).toBe(true);
    }
  });
});
