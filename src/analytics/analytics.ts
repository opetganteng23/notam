import { findAirport } from '../master/airports';
import { CONDITION_NAME, SUBJECT_NAME } from './types';

const H = 3_600_000;
export const STALE_HOURS = 24;

export interface DocLike {
  formNo: string;
  airport: string;
  originator: string;
  status: string;
  createdAt: Date;
  events: { actor: string; role: string; action: string; from: string; to: string; at: Date }[];
  versions: { freeText?: string; generated?: string; provider?: string; ms?: number; corrections?: string[]; validation?: { status: string } }[];
}

export interface Analytics {
  period: { from: string | null; to: string | null; generatedAt: string; airport: string | null };
  kpi: {
    total: number; approved: number; rejected: number; inReview: number; needsRevision: number;
    approvalRate: number | null; firstPassRate: number | null;
    avgTurnaroundH: number | null; medianTurnaroundH: number | null; avgRevisions: number | null;
    aiPassRate: number | null; correctedRate: number | null; regenRate: number | null; avgGenSec: number | null;
    pendingOver24h: number;
    submitted: number; revisedDocs: number; revisionRate: number | null; rejectionRate: number | null;
  };
  previous: { from: string; to: string; kpi: Analytics['kpi']; stages: Analytics['stages'] } | null;
  status: Record<string, number>;
  funnel: { label: string; n: number }[];
  granularity: 'day' | 'month';
  series: { period: string; submitted: number; approved: number }[];
  stages: { stage: string; n: number; avgH: number | null; medianH: number | null; maxH: number | null }[];
  pending: { stage: string; n: number; oldestH: number | null; over24h: number }[];
  returns: { role: string; revise: number; reject: number }[];
  airports: { airport: string; name: string; n: number; approved: number; rejected: number }[];
  fir: { fir: string; n: number }[];
  qcodes: { code: string; label: string; n: number }[];
  originators: { originator: string; n: number; approved: number; rejected: number; approvalRate: number | null }[];
  ai: { validation: Record<string, number>; providers: { provider: string; n: number }[] };
  insights: string[];
}

export interface Row {
  formNo: string; createdAt: Date; airport: string; originator: string; status: string; revisions: number;
  validation: string; qcode: string; turnaroundH: number | null; stageNow: string; prompt: string; generated: string;
}

const STAGE_OF: Record<string, string> = { UNDER_ATS: 'ATS', UNDER_PIA: 'PIA', UNDER_NOF: 'NOF', REVISION_REQUIRED: 'Originator (revisi)' };

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const avg = (a: number[]) => (a.length ? sum(a) / a.length : null);
const median = (a: number[]) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const ratio = (n: number, d: number) => (d ? n / d : null);
const pct = (r: number | null) => (r === null ? '-' : `${Math.round(r * 100)}%`);
const dec = (n: number, d = 1) => n.toFixed(d).replace('.', ',');

export function fmtDuration(h: number | null): string {
  if (h === null) return '-';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} menit`;
  if (h < 48) return `${dec(h)} jam`;
  return `${dec(h / 24)} hari`;
}

const iso = (d: Date) => d.toISOString();
const dayKey = (d: Date) => iso(d).slice(0, 10);
const monthKey = (d: Date) => iso(d).slice(0, 7);

function qcodeOf(generated?: string) {
  const m = /Q\)\s*\w{4}\/Q([A-Z]{2})([A-Z]{2})/.exec(generated ?? '');
  return m ? { code: `Q${m[1]}${m[2]}`, label: `${SUBJECT_NAME[m[1]] ?? m[1]} – ${(CONDITION_NAME[m[2]] ?? m[2]).toLowerCase()}` } : null;
}

// Menghitung seluruh metrik dashboard eksekutif dari dokumen non-Draft. Fungsi murni agar mudah diuji.
export function computeAnalytics(docs: DocLike[], o: { from?: Date; to?: Date; airport?: string; now?: Date } = {}): { analytics: Analytics; rows: Row[] } {
  const now = o.now ?? new Date();
  const sorted = (d: DocLike) => [...d.events].sort((a, b) => +new Date(a.at) - +new Date(b.at));

  const status: Record<string, number> = {};
  const stageDur: Record<string, number[]> = {};
  const pendingAge: Record<string, number[]> = {};
  const returns: Record<string, { revise: number; reject: number }> = {};
  const airports = new Map<string, { n: number; approved: number; rejected: number }>();
  const fir = new Map<string, number>();
  const qcodes = new Map<string, { label: string; n: number }>();
  const originators = new Map<string, { n: number; approved: number; rejected: number }>();
  const validation: Record<string, number> = {};
  const providers = new Map<string, number>();
  const turnaround: number[] = [];
  const revisionCounts: number[] = [];
  const genMs: number[] = [];
  let submitted = 0, passedAts = 0, passedPia = 0, firstPass = 0, corrected = 0, regenerated = 0, withValidation = 0;
  const rows: Row[] = [];
  const submits: Date[] = [];
  const approvals: Date[] = [];

  for (const d of docs) {
    status[d.status] = (status[d.status] ?? 0) + 1;
    const ev = sorted(d);
    const approvedEv = [...ev].reverse().find((e) => e.to === 'APPROVED_BY_NOF');
    const firstSubmit = ev.find((e) => e.action === 'SUBMIT');
    if (firstSubmit) { submitted++; submits.push(new Date(firstSubmit.at)); }
    if (ev.some((e) => e.role === 'ATS' && e.action === 'ACCEPT')) passedAts++;
    if (ev.some((e) => e.role === 'PIA' && e.action === 'ACCEPT')) passedPia++;
    const back = ev.filter((e) => e.action === 'REVISE' || e.action === 'REJECT');
    for (const e of back) {
      const r = (returns[e.role] ??= { revise: 0, reject: 0 });
      if (e.action === 'REVISE') r.revise++; else r.reject++;
    }
    const revisions = ev.filter((e) => e.action === 'REVISE').length;
    revisionCounts.push(revisions);
    let tH: number | null = null;
    if (approvedEv && firstSubmit) {
      tH = (+new Date(approvedEv.at) - +new Date(firstSubmit.at)) / H;
      turnaround.push(tH);
      approvals.push(new Date(approvedEv.at));
      if (!back.length) firstPass++;
    }

    ev.forEach((e, i) => {
      const stage = STAGE_OF[e.to];
      const next = ev[i + 1];
      if (stage && next) (stageDur[stage] ??= []).push((+new Date(next.at) - +new Date(e.at)) / H);
    });
    const cur = STAGE_OF[d.status];
    if (cur && ev.length) (pendingAge[cur] ??= []).push((+now - +new Date(ev[ev.length - 1].at)) / H);

    const a = airports.get(d.airport) ?? { n: 0, approved: 0, rejected: 0 };
    a.n++;
    if (d.status === 'APPROVED_BY_NOF') a.approved++;
    if (d.status === 'REJECTED') a.rejected++;
    airports.set(d.airport, a);
    const f = findAirport(d.airport)?.fir;
    if (f) fir.set(f, (fir.get(f) ?? 0) + 1);
    const og = originators.get(d.originator) ?? { n: 0, approved: 0, rejected: 0 };
    og.n++;
    if (d.status === 'APPROVED_BY_NOF') og.approved++;
    if (d.status === 'REJECTED') og.rejected++;
    originators.set(d.originator, og);

    const last = d.versions[d.versions.length - 1];
    const q = qcodeOf(last?.generated);
    if (q) qcodes.set(q.code, { label: q.label, n: (qcodes.get(q.code)?.n ?? 0) + 1 });
    if (last?.validation?.status) { validation[last.validation.status] = (validation[last.validation.status] ?? 0) + 1; withValidation++; }
    if (last?.corrections?.length) corrected++;
    if (d.versions.length > 1) regenerated++;
    if (last?.provider) providers.set(last.provider, (providers.get(last.provider) ?? 0) + 1);
    if (typeof last?.ms === 'number') genMs.push(last.ms);

    rows.push({
      formNo: d.formNo, createdAt: d.createdAt, airport: d.airport, originator: d.originator, status: d.status, revisions,
      validation: last?.validation?.status ?? '-', qcode: q?.code ?? '-', turnaroundH: tH, stageNow: cur ?? '-',
      prompt: last?.freeText ?? '', generated: last?.generated ?? '',
    });
  }

  const total = docs.length;
  const approved = status.APPROVED_BY_NOF ?? 0;
  const rejected = status.REJECTED ?? 0;
  const inReview = (status.UNDER_ATS ?? 0) + (status.UNDER_PIA ?? 0) + (status.UNDER_NOF ?? 0);
  const needsRevision = status.REVISION_REQUIRED ?? 0;
  const allPending = Object.values(pendingAge).flat();
  const pendingOver24h = allPending.filter((h) => h > STALE_HOURS).length;

  // Rentang seri: harian bila <= 62 hari, selain itu bulanan.
  const createdTimes = docs.map((d) => +new Date(d.createdAt));
  const start = o.from ?? (createdTimes.length ? new Date(Math.min(...createdTimes)) : now);
  const end = o.to ?? now;
  const granularity: 'day' | 'month' = (+end - +start) / 86_400_000 <= 62 ? 'day' : 'month';
  const key = granularity === 'day' ? dayKey : monthKey;
  const buckets = new Map<string, { submitted: number; approved: number }>();
  if (total) {
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), granularity === 'day' ? start.getUTCDate() : 1));
    const last = new Date(Math.max(+end, ...createdTimes));
    while (+cursor <= +last) {
      buckets.set(key(cursor), { submitted: 0, approved: 0 });
      if (granularity === 'day') cursor.setUTCDate(cursor.getUTCDate() + 1); else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    for (const t of submits) { const b = buckets.get(key(t)); if (b) b.submitted++; }
    for (const t of approvals) { const b = buckets.get(key(t)); if (b) b.approved++; }
  }

  const stageList = ['ATS', 'PIA', 'NOF', 'Originator (revisi)'];
  const stages = stageList.map((s) => ({ stage: s, n: (stageDur[s] ?? []).length, avgH: avg(stageDur[s] ?? []), medianH: median(stageDur[s] ?? []), maxH: (stageDur[s] ?? []).length ? Math.max(...stageDur[s]) : null }));
  const pending = stageList.map((s) => ({ stage: s, n: (pendingAge[s] ?? []).length, oldestH: (pendingAge[s] ?? []).length ? Math.max(...pendingAge[s]) : null, over24h: (pendingAge[s] ?? []).filter((h) => h > STALE_HOURS).length }));

  const top = <T,>(m: Map<string, T>, by: (v: T) => number, n: number) => [...m.entries()].sort((a, b) => by(b[1]) - by(a[1]) || a[0].localeCompare(b[0])).slice(0, n);
  const airportList = top(airports, (v) => v.n, 8).map(([airport, v]) => ({ airport, name: findAirport(airport)?.name ?? '', ...v }));
  const qList = top(qcodes, (v) => v.n, 8).map(([code, v]) => ({ code, label: v.label, n: v.n }));
  const ogList = top(originators, (v) => v.n, 8).map(([originator, v]) => ({ originator, ...v, approvalRate: ratio(v.approved, v.approved + v.rejected) }));

  const kpi: Analytics['kpi'] = {
    total, approved, rejected, inReview, needsRevision,
    approvalRate: ratio(approved, approved + rejected),
    firstPassRate: ratio(firstPass, approved),
    avgTurnaroundH: avg(turnaround), medianTurnaroundH: median(turnaround),
    avgRevisions: avg(revisionCounts),
    aiPassRate: ratio(validation.passed ?? 0, withValidation),
    correctedRate: ratio(corrected, total),
    regenRate: ratio(regenerated, total),
    avgGenSec: genMs.length ? (avg(genMs) as number) / 1000 : null,
    pendingOver24h,
    submitted, revisedDocs: revisionCounts.filter((n) => n > 0).length,
    revisionRate: ratio(revisionCounts.filter((n) => n > 0).length, submitted),
    rejectionRate: ratio(rejected, approved + rejected),
  };

  const returnsList = Object.entries(returns).map(([role, v]) => ({ role, ...v })).sort((a, b) => b.revise + b.reject - (a.revise + a.reject));
  const analytics: Analytics = {
    period: { from: o.from ? iso(o.from) : null, to: o.to ? iso(o.to) : null, generatedAt: iso(now), airport: o.airport ?? null },
    kpi, previous: null, status,
    funnel: [
      { label: 'Diajukan (submit)', n: submitted },
      { label: 'Lolos ATS', n: passedAts },
      { label: 'Lolos PIA', n: passedPia },
      { label: 'Disetujui NOF', n: approved },
    ],
    granularity, series: [...buckets.entries()].map(([period, v]) => ({ period, ...v })),
    stages, pending, returns: returnsList,
    airports: airportList,
    fir: top(fir, (v) => v, 6).map(([f, n]) => ({ fir: f, n })),
    qcodes: qList, originators: ogList,
    ai: { validation, providers: top(providers, (v) => v, 5).map(([provider, n]) => ({ provider, n })) },
    insights: [],
  };
  analytics.insights = buildInsights(analytics);
  return { analytics, rows };
}

// Ringkasan kalimat otomatis (berbasis aturan, tanpa LLM) untuk executive summary.
export function buildInsights(a: Analytics): string[] {
  const k = a.kpi;
  if (!k.total) return ['Belum ada pengajuan pada periode ini.'];
  const out: string[] = [];
  out.push(`${k.total} pengajuan pada periode ini: ${k.approved} disetujui, ${k.rejected} ditolak, ${k.inReview + k.needsRevision} masih berjalan.`);
  if (k.approvalRate !== null)
    out.push(`Tingkat persetujuan ${pct(k.approvalRate)} dari ${k.approved + k.rejected} pengajuan yang selesai; ${pct(k.firstPassRate)} disetujui tanpa revisi.`);
  if (k.avgTurnaroundH !== null) out.push(`Rata-rata waktu penyelesaian ${fmtDuration(k.avgTurnaroundH)} (median ${fmtDuration(k.medianTurnaroundH)}) dari pengajuan hingga persetujuan NOF.`);
  const slow = a.stages.filter((s) => s.avgH !== null).sort((x, y) => (y.avgH as number) - (x.avgH as number))[0];
  if (slow) out.push(`Tahap terlama: ${slow.stage}, rata-rata ${fmtDuration(slow.avgH)} per pengajuan.`);
  const rev = a.stages.filter((s) => ['ATS', 'PIA', 'NOF'].includes(s.stage) && s.avgH !== null && s.n >= 3).sort((x, y) => (y.avgH as number) - (x.avgH as number));
  if (rev.length >= 2) {
    const fast = rev[rev.length - 1];
    const gap = ((rev[0].avgH as number) / (fast.avgH as number) - 1) * 100;
    if (gap >= 20) out.push(`Hambatan proses: tahap ${rev[0].stage} ${Math.round(gap)}% lebih lama dibanding ${fast.stage} (${fmtDuration(rev[0].avgH)} vs ${fmtDuration(fast.avgH)}).`);
  }
  if (k.revisionRate !== null && k.submitted) out.push(`${k.revisedDocs} dari ${k.submitted} pengajuan (${pct(k.revisionRate)}) pernah dikembalikan untuk revisi.`);
  const p = a.previous;
  if (p && p.kpi.total) {
    const d = Math.round(((k.total - p.kpi.total) / p.kpi.total) * 100);
    out.push(`Jumlah pengajuan ${d === 0 ? 'sama dengan' : d > 0 ? `naik ${d}% dibanding` : `turun ${-d}% dibanding`} periode sebelumnya yang sama panjang (${p.kpi.total} pengajuan).`);
  }
  out.push(k.pendingOver24h ? `${k.pendingOver24h} pengajuan menunggu lebih dari ${STALE_HOURS} jam di satu tahap.` : `Tidak ada pengajuan yang menunggu lebih dari ${STALE_HOURS} jam.`);
  const ap = a.airports[0];
  if (ap) out.push(`Bandara terbanyak: ${ap.airport}${ap.name ? ` (${ap.name})` : ''}, ${ap.n} pengajuan (${pct(ap.n / k.total)}).`);
  const q = a.qcodes[0];
  if (q) out.push(`Jenis NOTAM terbanyak: ${q.code} (${q.label}), ${q.n} pengajuan.`);
  const r = a.returns[0];
  if (r) out.push(`Pengembalian terbanyak berasal dari ${r.role}: ${r.revise} revisi dan ${r.reject} penolakan.`);
  if (k.aiPassRate !== null)
    out.push(`${pct(k.aiPassRate)} hasil AI langsung lolos validasi; ${pct(k.correctedRate)} dikoreksi otomatis oleh sistem${k.avgGenSec !== null ? `; rata-rata generate ${dec(k.avgGenSec)} detik` : ''}.`);
  return out;
}
