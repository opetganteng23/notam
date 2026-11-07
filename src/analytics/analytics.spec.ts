import { DocLike, buildInsights, computeAnalytics, fmtDuration } from './analytics';

const T0 = Date.UTC(2025, 0, 1);
const at = (h: number) => new Date(T0 + h * 3_600_000);
const ev = (h: number, actor: string, role: string, action: string, from: string, to: string) => ({ actor, role, action, from, to, at: at(h) });

const A: DocLike = {
  formNo: 'A', airport: 'WIHH', originator: 'o1', status: 'APPROVED_BY_NOF', createdAt: at(0),
  events: [
    ev(0, 'o1', 'ORIGINATOR', 'SUBMIT', 'DRAFT', 'UNDER_ATS'), ev(2, 'ats', 'ATS', 'ACCEPT', 'UNDER_ATS', 'UNDER_PIA'),
    ev(6, 'pia', 'PIA', 'ACCEPT', 'UNDER_PIA', 'UNDER_NOF'), ev(7, 'nof', 'NOF', 'ACCEPT', 'UNDER_NOF', 'APPROVED_BY_NOF'),
  ],
  versions: [{ generated: 'Q) WIIF/QMRLC/IV/NBO/A/000/999/0616S10653E005\nA) WIHH', provider: 'ollama', ms: 3000, corrections: ['FIR dikoreksi'], validation: { status: 'passed' } }],
};
const B: DocLike = {
  formNo: 'B', airport: 'WADD', originator: 'o1', status: 'REJECTED', createdAt: at(24),
  events: [
    ev(24, 'o1', 'ORIGINATOR', 'SUBMIT', 'DRAFT', 'UNDER_PIA'), ev(26, 'pia', 'PIA', 'REVISE', 'UNDER_PIA', 'REVISION_REQUIRED'),
    ev(30, 'o1', 'ORIGINATOR', 'SUBMIT', 'REVISION_REQUIRED', 'UNDER_PIA'), ev(31, 'pia', 'PIA', 'REJECT', 'UNDER_PIA', 'REJECTED'),
  ],
  versions: [
    { generated: 'x', provider: 'ollama', ms: 1000, validation: { status: 'failed' } },
    { generated: 'Q) WAAF/QMXLC/IV/NBO/A/000/999/0845S11510E005', provider: 'ollama', ms: 5000, validation: { status: 'warning' } },
  ],
};
const C: DocLike = {
  formNo: 'C', airport: 'WIHH', originator: 'o2', status: 'UNDER_ATS', createdAt: at(48),
  events: [ev(48, 'o2', 'ORIGINATOR', 'SUBMIT', 'DRAFT', 'UNDER_ATS')],
  versions: [{ generated: '', provider: 'ollama' }],
};
const NOW = at(100);

describe('computeAnalytics', () => {
  const { analytics: a, rows } = computeAnalytics([A, B, C], { now: NOW });

  it('KPI utama dapat dihitung manual', () => {
    expect(a.kpi).toMatchObject({ total: 3, approved: 1, rejected: 1, inReview: 1, needsRevision: 0, approvalRate: 0.5, firstPassRate: 1, avgTurnaroundH: 7, medianTurnaroundH: 7, pendingOver24h: 1 });
    expect(a.kpi.avgRevisions).toBeCloseTo(1 / 3);
    expect(a.status).toEqual({ APPROVED_BY_NOF: 1, REJECTED: 1, UNDER_ATS: 1 });
  });

  it('funnel dihitung dari event, termasuk jalur yang melewati ATS', () => {
    expect(a.funnel.map((f) => f.n)).toEqual([3, 1, 1, 1]);
  });

  it('lama tinggal per tahap: hanya tahap yang sudah selesai; antrean dilaporkan terpisah', () => {
    const s = Object.fromEntries(a.stages.map((x) => [x.stage, x]));
    expect(s.ATS).toMatchObject({ n: 1, avgH: 2, maxH: 2 });
    expect(s.PIA.n).toBe(3); // 4 jam, 2 jam, 1 jam
    expect(s.PIA.avgH).toBeCloseTo(7 / 3);
    expect(s.PIA.maxH).toBe(4);
    expect(s.NOF).toMatchObject({ n: 1, avgH: 1 });
    expect(s['Originator (revisi)']).toMatchObject({ n: 1, avgH: 4 });
    expect(a.pending.find((p) => p.stage === 'ATS')).toMatchObject({ n: 1, oldestH: 52, over24h: 1 });
  });

  it('pengembalian, bandara, kode Q, pengusul', () => {
    expect(a.returns).toEqual([{ role: 'PIA', revise: 1, reject: 1 }]);
    expect(a.airports.map((x) => [x.airport, x.n, x.approved, x.rejected])).toEqual([['WIHH', 2, 1, 0], ['WADD', 1, 0, 1]]);
    expect(a.qcodes).toEqual([{ code: 'QMRLC', label: 'Runway – ditutup', n: 1 }, { code: 'QMXLC', label: 'Taxiway – ditutup', n: 1 }]);
    expect(a.originators.find((o) => o.originator === 'o1')).toMatchObject({ n: 2, approved: 1, rejected: 1, approvalRate: 0.5 });
    expect(a.originators.find((o) => o.originator === 'o2')?.approvalRate).toBeNull();
  });

  it('kualitas AI memakai versi terakhir', () => {
    expect(a.ai.validation).toEqual({ passed: 1, warning: 1 });
    expect(a.kpi.aiPassRate).toBe(0.5);
    expect(a.kpi.correctedRate).toBeCloseTo(1 / 3);
    expect(a.kpi.regenRate).toBeCloseTo(1 / 3);
    expect(a.kpi.avgGenSec).toBe(4); // (3000 + 5000) / 2 dtk
  });

  it('seri harian terisi tanpa celah', () => {
    expect(a.granularity).toBe('day');
    expect(a.series).toEqual([
      { period: '2025-01-01', submitted: 1, approved: 1 }, { period: '2025-01-02', submitted: 1, approved: 0 },
      { period: '2025-01-03', submitted: 1, approved: 0 }, { period: '2025-01-04', submitted: 0, approved: 0 },
      { period: '2025-01-05', submitted: 0, approved: 0 },
    ]);
  });

  it('baris data per pengajuan', () => {
    expect(rows.find((r) => r.formNo === 'A')).toMatchObject({ revisions: 0, validation: 'passed', qcode: 'QMRLC', turnaroundH: 7, stageNow: '-' });
    expect(rows.find((r) => r.formNo === 'B')).toMatchObject({ revisions: 1, turnaroundH: null });
    expect(rows.find((r) => r.formNo === 'C')?.stageNow).toBe('ATS');
  });

  it('insight berisi angka yang konsisten dengan KPI', () => {
    const t = a.insights.join('\n');
    expect(t).toContain('3 pengajuan pada periode ini: 1 disetujui, 1 ditolak, 1 masih berjalan.');
    expect(t).toContain('Tingkat persetujuan 50% dari 2 pengajuan');
    expect(t).toContain('1 pengajuan menunggu lebih dari 24 jam');
    expect(t).toContain('Bandara terbanyak: WIHH');
    expect(t).toContain('Pengembalian terbanyak berasal dari PIA: 1 revisi dan 1 penolakan.');
  });

  it('tingkat revisi dan penolakan dihitung dari riwayat', () => {
    expect(a.kpi.submitted).toBe(3);
    expect(a.kpi.revisedDocs).toBe(1);
    expect(a.kpi.revisionRate).toBeCloseTo(1 / 3);
    expect(a.kpi.rejectionRate).toBe(0.5); // 1 ditolak dari 2 yang selesai
    expect(a.previous).toBeNull();
  });

  it('insight membandingkan dengan periode sebelumnya yang sama panjang', () => {
    const up = buildInsights({ ...a, previous: { from: 'x', to: 'y', stages: a.stages, kpi: { ...a.kpi, total: 2 } } }).join('\n');
    expect(up).toContain('naik 50% dibanding periode sebelumnya');
    const down = buildInsights({ ...a, previous: { from: 'x', to: 'y', stages: a.stages, kpi: { ...a.kpi, total: 6 } } }).join('\n');
    expect(down).toContain('turun 50% dibanding periode sebelumnya');
    const none = buildInsights({ ...a, previous: { from: 'x', to: 'y', stages: a.stages, kpi: { ...a.kpi, total: 0 } } }).join('\n');
    expect(none).not.toContain('periode sebelumnya');
  });

  it('periode panjang beralih ke seri bulanan', () => {
    const far: DocLike = { ...C, formNo: 'D', createdAt: at(24 * 120), events: [ev(24 * 120, 'o2', 'ORIGINATOR', 'SUBMIT', 'DRAFT', 'UNDER_ATS')] };
    const r = computeAnalytics([A, far], { now: at(24 * 130) }).analytics;
    expect(r.granularity).toBe('month');
    expect(r.series.map((x) => x.period)).toEqual(['2025-01', '2025-02', '2025-03', '2025-04', '2025-05']);
  });

  it('tanpa data: tidak ada pembagian nol dan pesan jelas', () => {
    const e = computeAnalytics([], { now: NOW }).analytics;
    expect(e.kpi).toMatchObject({ total: 0, approvalRate: null, avgTurnaroundH: null, aiPassRate: null, pendingOver24h: 0 });
    expect(e.series).toEqual([]);
    expect(e.insights).toEqual(['Belum ada pengajuan pada periode ini.']);
  });
});

describe('fmtDuration', () => {
  it('menit, jam, hari dengan koma desimal', () => {
    expect(fmtDuration(null)).toBe('-');
    expect(fmtDuration(0.5)).toBe('30 menit');
    expect(fmtDuration(0.001)).toBe('1 menit');
    expect(fmtDuration(2.25)).toBe('2,3 jam');
    expect(fmtDuration(72)).toBe('3,0 hari');
  });
});
