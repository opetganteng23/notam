import { KeyboardEvent, MouseEvent, ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Analytics, api, download } from './api';
import { Drill } from './types-report';
import { fmtDateTime, fmtDuration, fmtPct, useAsync } from './util';

const STATUS_LABEL: Record<string, string> = {
  UNDER_ATS: 'Review ATS', UNDER_PIA: 'Review PIA', UNDER_NOF: 'Review NOF',
  REVISION_REQUIRED: 'Perlu revisi', REJECTED: 'Ditolak', APPROVED_BY_NOF: 'Disetujui NOF',
};
const STATUS_COLOR: Record<string, string> = { APPROVED_BY_NOF: '#17784f', REJECTED: '#b83232', REVISION_REQUIRED: '#f2a900', UNDER_ATS: '#1769c2', UNDER_PIA: '#5aa2e6', UNDER_NOF: '#8fb8e8' };

type Preset = '7' | '30' | '90' | 'year' | 'all' | 'custom';
const PRESETS: [Preset, string][] = [['7', '7 hari'], ['30', '30 hari'], ['90', '90 hari'], ['year', 'Tahun ini'], ['all', 'Semua'], ['custom', 'Kustom']];

type TipFn = (text: string | null, e?: { clientX: number; clientY: number }) => void;
const TipCtx = createContext<TipFn>(() => undefined);

// Properti interaktif untuk elemen grafik: tooltip saat disorot, dan (bila ada `pick`) klik/Enter membuka rincian.
function useHot() {
  const tip = useContext(TipCtx);
  return (text: string, pick?: () => void) => ({
    onMouseEnter: (e: MouseEvent) => tip(text, e),
    onMouseMove: (e: MouseEvent) => tip(text, e),
    onMouseLeave: () => tip(null),
    ...(pick && {
      role: 'button', tabIndex: 0, 'aria-label': text, onClick: pick,
      onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } },
    }),
  });
}

type Slice = { label: string; value: number; color: string; pick?: string };
export function Donut({ data, onPick }: { data: Slice[]; onPick?: (key: string) => void }) {
  const hot = useHot();
  const total = data.reduce((a, d) => a + d.value, 0);
  const r = 52, c = 2 * Math.PI * r;
  let acc = 0;
  const pct = (v: number) => (total ? `${Math.round((v / total) * 100)}%` : '–');
  const go = (d: Slice) => (d.pick && onPick ? () => onPick(d.pick!) : undefined);
  return (
    <div className="donut">
      <svg viewBox="0 0 140 140" role="img" aria-label="Diagram donat">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#eef2f7" strokeWidth="22" />
        {total > 0 && data.filter((d) => d.value > 0).map((d) => {
          const len = (d.value / total) * c;
          const el = <circle key={d.label} cx="70" cy="70" r={r} fill="none" stroke={d.color} strokeWidth="22" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)" {...hot(`${d.label}: ${d.value} (${pct(d.value)})`, go(d))} />;
          acc += len;
          return el;
        })}
        <text x="70" y="68" textAnchor="middle" className="dn">{total}</text>
        <text x="70" y="85" textAnchor="middle" className="dl">total</text>
      </svg>
      <ul>
        {data.map((d) => <li key={d.label} {...hot(`${d.label}: ${d.value} (${pct(d.value)})`, go(d))}><i style={{ background: d.color }} />{d.label}<b>{d.value}</b><span>{pct(d.value)}</span></li>)}
      </ul>
    </div>
  );
}

const C = { blue: '#1769c2', sky: '#5aa2e6', pale: '#8fb8e8', green: '#17784f', amber: '#f2a900', red: '#b83232', navy: '#0b2545', teal: '#0e8f9a' };
const PAL = [C.blue, C.teal, C.sky, C.amber, C.navy, C.green, C.pale, C.red];

function AreaChart({ series, granularity, onPick }: { series: Analytics['series']; granularity: 'day' | 'month'; onPick: (period: string) => void }) {
  const hot = useHot();
  const W = 760, H = 250, L = 34, R = 10, T = 14, B = 30;
  const max = Math.max(1, ...series.flatMap((s) => [s.submitted, s.approved]));
  const top = max <= 4 ? max : Math.ceil(max / 4) * 4;
  const x = (i: number) => L + (series.length <= 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (series.length - 1));
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const path = (k: 'submitted' | 'approved') => series.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s[k]).toFixed(1)}`).join(' ');
  const area = (k: 'submitted' | 'approved') => `${path(k)} L${x(series.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const every = Math.max(1, Math.ceil(series.length / 10));
  const label = (p: string) => (granularity === 'day' ? `${p.slice(8)}/${p.slice(5, 7)}` : p);
  const ticks = [0, 1, 2, 3, 4].map((i) => Math.round((top * i) / 4));
  const step = series.length > 1 ? (W - L - R) / (series.length - 1) : W - L - R;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="line" role="img" aria-label="Tren pengajuan">
        <defs>
          <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.blue} stopOpacity=".28" /><stop offset="1" stopColor={C.blue} stopOpacity="0" /></linearGradient>
          <linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.green} stopOpacity=".25" /><stop offset="1" stopColor={C.green} stopOpacity="0" /></linearGradient>
        </defs>
        {[...new Set(ticks)].map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e3e8ef" strokeDasharray="3 4" /><text x={L - 6} y={y(t) + 4} textAnchor="end">{t}</text></g>)}
        {series.map((s, i) => i % every === 0 && <text key={s.period} x={x(i)} y={H - 10} textAnchor="middle">{label(s.period)}</text>)}
        {series.length > 1 && <><path d={area('submitted')} fill="url(#ga)" /><path d={area('approved')} fill="url(#gb)" /></>}
        <path d={path('submitted')} fill="none" stroke={C.blue} strokeWidth="2.5" strokeLinejoin="round" />
        <path d={path('approved')} fill="none" stroke={C.green} strokeWidth="2.5" strokeLinejoin="round" />
        {series.map((s, i) => (
          <g key={s.period} className="pt" {...hot(`${s.period} · diajukan ${s.submitted}, disetujui ${s.approved}`, () => onPick(s.period))}>
            <rect x={x(i) - step / 2} y={T} width={step} height={H - T - B} fill="transparent" />
            <line className="guide" x1={x(i)} x2={x(i)} y1={T} y2={H - B} stroke="#9fb3cc" strokeDasharray="3 3" />
            <circle cx={x(i)} cy={y(s.submitted)} r="4" fill={C.blue} />
            <circle cx={x(i)} cy={y(s.approved)} r="4" fill={C.green} />
          </g>
        ))}
      </svg>
      <div className="legend"><span><i style={{ background: C.blue }} />Diajukan</span><span><i style={{ background: C.green }} />Disetujui</span></div>
    </div>
  );
}

function Spark({ values, color = C.blue }: { values: number[]; color?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(1)},${(28 - (v / max) * 26).toFixed(1)}`).join(' ');
  return <svg className="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points={pts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" /></svg>;
}

function Ring({ value, label, color, hint }: { value: number | null; label: string; color: string; hint: string }) {
  const hot = useHot();
  const r = 34, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value ?? 0));
  return (
    <div className="ring" {...hot(`${label}: ${fmtPct(value)} — ${hint}`)}>
      <svg viewBox="0 0 90 90" role="img" aria-label={`${label}: ${fmtPct(value)}`}>
        <circle cx="45" cy="45" r={r} fill="none" stroke="#eef2f7" strokeWidth="9" />
        <circle cx="45" cy="45" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${v * c} ${c}`} transform="rotate(-90 45 45)" />
        <text x="45" y="50" textAnchor="middle" className="rv">{fmtPct(value)}</text>
      </svg>
      <span>{label}</span>
    </div>
  );
}

// Radar kesehatan operasi. Setiap sumbu bernilai 0-100 (makin besar makin sehat); sumbu tanpa data tampil di titik pusat.
// Kecepatan tahap: 100 = rata-rata di bawah 1 jam, 0 = 24 jam atau lebih (24 jam = batas "macet" yang sama dengan penanda antrean).
export function radarAxes(k: Analytics['kpi'], stages: Analytics['stages']) {
  const speed = (name: string) => { const h = stages.find((s) => s.stage === name)?.avgH ?? null; return h === null ? null : Math.round(100 * (1 - Math.min(h, 24) / 24)); };
  const rate = (r: number | null) => (r === null ? null : Math.round(r * 100));
  return [
    { key: 'Persetujuan', value: rate(k.approvalRate), def: 'Disetujui dibanding yang sudah selesai (disetujui + ditolak)' },
    { key: 'Tanpa revisi', value: rate(k.firstPassRate), def: 'Disetujui tanpa pernah dikembalikan' },
    { key: 'Tidak ditolak', value: k.rejectionRate === null ? null : 100 - Math.round(k.rejectionRate * 100), def: '100% dikurangi tingkat penolakan' },
    { key: 'Kecepatan ATS', value: speed('ATS'), def: 'Rata-rata lama tinggal di ATS (100 = di bawah 1 jam, 0 = 24 jam atau lebih)' },
    { key: 'Kecepatan PIA', value: speed('PIA'), def: 'Rata-rata lama tinggal di PIA (skala yang sama)' },
    { key: 'Kecepatan NOF', value: speed('NOF'), def: 'Rata-rata lama tinggal di NOF (skala yang sama)' },
  ];
}

function Radar({ cur, prev }: { cur: ReturnType<typeof radarAxes>; prev: ReturnType<typeof radarAxes> | null }) {
  const hot = useHot();
  const S = 340, c = S / 2, R = 108, n = cur.length;
  const ang = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i: number, v: number | null): [number, number] => { const r = (R * (v ?? 0)) / 100; return [c + r * Math.cos(ang(i)), c + r * Math.sin(ang(i))]; };
  const poly = (axes: ReturnType<typeof radarAxes>) => axes.map((a, i) => pt(i, a.value).map((x) => x.toFixed(1)).join(',')).join(' ');
  return (
    <div>
      <svg viewBox={`0 0 ${S} ${S}`} className="radar" role="img" aria-label="Radar kesehatan operasi">
        {[25, 50, 75, 100].map((g) => <polygon key={g} points={cur.map((_, i) => pt(i, g).map((x) => x.toFixed(1)).join(',')).join(' ')} fill="none" stroke="#dfe6ef" strokeWidth="1" />)}
        {cur.map((_, i) => <line key={i} x1={c} y1={c} x2={pt(i, 100)[0]} y2={pt(i, 100)[1]} stroke="#dfe6ef" />)}
        {prev && <polygon points={poly(prev)} fill="none" stroke="#66758a" strokeWidth="2" strokeDasharray="5 4" />}
        <polygon points={poly(cur)} fill={C.blue} fillOpacity=".18" stroke={C.blue} strokeWidth="2.5" strokeLinejoin="round" />
        {cur.map((a, i) => {
          const [x, y] = pt(i, a.value), [lx, ly] = pt(i, 122);
          return (
            <g key={a.key} {...hot(`${a.key}: ${a.value === null ? 'belum ada data' : `${a.value}/100`}${prev && prev[i].value !== null ? ` · periode sebelumnya ${prev[i].value}/100` : ''} — ${a.def}`)}>
              <circle cx={x} cy={y} r="4.5" fill={a.value === null ? '#b9c3d0' : C.blue} />
              <text x={lx} y={ly} textAnchor={Math.abs(lx - c) < 6 ? 'middle' : lx > c ? 'start' : 'end'} dominantBaseline="middle" className="radar-l">{a.key}</text>
              <text x={lx} y={ly + 13} textAnchor={Math.abs(lx - c) < 6 ? 'middle' : lx > c ? 'start' : 'end'} dominantBaseline="middle" className="radar-v">{a.value === null ? '–' : a.value}</text>
            </g>
          );
        })}
      </svg>
      <div className="legend"><span><i style={{ background: C.blue }} />Periode ini</span>{prev && <span><i style={{ background: '#66758a' }} />Periode sebelumnya</span>}</div>
    </div>
  );
}

type Part = { label: string; v: number; color: string };
function Stacked({ rows, onPick }: { rows: { label: string; title?: string; parts: Part[] }[]; onPick?: (row: string) => void }) {
  const hot = useHot();
  if (!rows.length) return <p className="muted">Belum ada data.</p>;
  const max = Math.max(1, ...rows.map((r) => r.parts.reduce((a, p) => a + p.v, 0)));
  return (
    <div className="stk">
      {rows.map((r) => {
        const tot = r.parts.reduce((a, p) => a + p.v, 0);
        const go = onPick ? () => onPick(r.label) : undefined;
        return (
          <div className="stk-row" key={r.label}>
            <span className="mono" {...hot(r.title ? `${r.label} · ${r.title}` : r.label, go)}>{r.label}</span>
            <div className="stk-track"><div style={{ width: `${(tot / max) * 100}%` }}>{r.parts.filter((p) => p.v > 0).map((p) => <i key={p.label} style={{ flex: p.v, background: p.color }} {...hot(`${r.label} · ${p.label}: ${p.v}`, go)} />)}</div></div>
            <b>{tot}</b>
          </div>
        );
      })}
      <div className="legend">{[...new Map(rows.flatMap((r) => r.parts).map((p) => [p.label, p.color] as const)).entries()].map(([l, c]) => <span key={l}><i style={{ background: c }} />{l}</span>)}</div>
    </div>
  );
}

function Columns({ rows, onPick }: { rows: { label: string; parts: Part[] }[]; onPick?: (row: string) => void }) {
  const hot = useHot();
  const max = Math.max(1, ...rows.flatMap((r) => r.parts.map((p) => p.v)));
  if (!rows.some((r) => r.parts.some((p) => p.v > 0))) return <p className="muted">Belum ada data.</p>;
  return (
    <div>
      <div className="cols" style={{ gridTemplateColumns: `repeat(${rows.length}, 1fr)` }}>
        {rows.map((r) => (
          <div className="col" key={r.label}>
            <div className="col-bars">{r.parts.map((p) => <div key={p.label} className="col-bar" style={{ height: `${Math.max(2, (p.v / max) * 100)}%`, background: p.color }} {...hot(`${r.label} · ${p.label}: ${p.v}`, onPick && p.v > 0 ? () => onPick(r.label) : undefined)}><em>{p.v || ''}</em></div>)}</div>
          </div>
        ))}
      </div>
      <div className="cols-x" style={{ gridTemplateColumns: `repeat(${rows.length}, 1fr)` }}>{rows.map((r) => <span key={r.label}>{r.label}</span>)}</div>
      <div className="legend">{rows[0].parts.map((p) => <span key={p.label}><i style={{ background: p.color }} />{p.label}</span>)}</div>
    </div>
  );
}

export function Bars({ rows, unit = '', color, onPick }: { rows: { label: string; value: number; text?: string; pick?: string }[]; unit?: string; color?: string; onPick?: (key: string) => void }) {
  const hot = useHot();
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="muted">Belum ada data.</p>;
  return <>{rows.map((r) => <div className="bar wide" key={r.label} {...hot(`${r.label}: ${r.text ?? `${r.value}${unit}`}`, r.pick && onPick ? () => onPick(r.pick!) : undefined)}><span className="mono" title={r.label}>{r.label}</span><i style={{ width: `${(r.value / max) * 100}%`, ...(color && { background: color }) }} /><b>{r.text ?? `${r.value}${unit}`}</b></div>)}</>;
}

export function Kpi({ value, label, sub, tone, spark, delta, onClick }: { value: string; label: string; sub?: string; tone?: string; spark?: ReactNode; delta?: ReactNode; onClick?: () => void }) {
  const hot = useHot();
  return <div className={`card ${tone ?? ''}`} {...(onClick ? hot(`${label}: klik untuk melihat daftar NOTAM`, onClick) : {})}><span className="num">{value}</span><span className="lbl">{label}</span>{sub && <span className="sub">{sub}</span>}{delta}{spark}</div>;
}

// Indikator perubahan terhadap periode sebelumnya yang sama panjang. Kosong bila tidak ada pembanding atau datanya tidak ada.
// kind 'rate' = selisih dalam poin persen; 'count' dan 'dur' = persen perubahan. good = arah yang berarti membaik.
export function Delta({ cur, prev, kind, good }: { cur: number | null; prev: number | null | undefined; kind: 'rate' | 'count' | 'dur'; good: 'up' | 'down' }) {
  if (prev === undefined || cur === null || prev === null) return null;
  let diff: number, text: string;
  if (kind === 'rate') { diff = Math.round((cur - prev) * 100); text = `${Math.abs(diff)} poin`; }
  else {
    if (prev === 0) return cur > 0 ? <span className="delta flat">baru, belum ada di periode sebelumnya</span> : null;
    diff = Math.round(((cur - prev) / prev) * 100); text = `${Math.abs(diff)}%`;
  }
  if (diff === 0) return <span className="delta flat">sama dengan periode sebelumnya</span>;
  const better = good === 'up' ? diff > 0 : diff < 0;
  return <span className={`delta ${better ? 'ok' : 'bad'}`}>{diff > 0 ? '▲' : '▼'} {text} vs periode sebelumnya</span>;
}

const iso = (d: Date) => d.toISOString();
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function AnalyticsPanel() {
  const [preset, setPreset] = useState<Preset>('30');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [airport, setAirport] = useState('');
  const [a, setA] = useState<Analytics | null>(null);
  const [busy, setBusy] = useState('');
  const [drill, setDrill] = useState<{ title: string; dim: string; value: string } | null>(null);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const showTip = useCallback<TipFn>((text, e) => setTip(text && e ? { text, x: e.clientX, y: e.clientY } : null), []);
  const open = (title: string, dim: string, value: string) => { setTip(null); setDrill({ title, dim, value }); };
  const { error, run } = useAsync();

  const query = useMemo(() => {
    const p: Record<string, string> = {};
    const now = new Date();
    if (preset === 'custom') {
      if (custom.from) p.from = iso(new Date(`${custom.from}T00:00:00`));
      if (custom.to) p.to = iso(new Date(`${custom.to}T23:59:59.999`));
    } else if (preset === 'year') p.from = iso(new Date(now.getFullYear(), 0, 1));
    else if (preset !== 'all') { const f = new Date(now); f.setDate(f.getDate() - Number(preset)); f.setHours(0, 0, 0, 0); p.from = iso(f); }
    if (/^[A-Z]{4}$/.test(airport)) p.airport = airport;
    return new URLSearchParams(p).toString();
  }, [preset, custom, airport]);

  const load = useCallback(() => run(async () => setA(await api<Analytics>('GET', `/analytics${query ? `?${query}` : ''}`))), [query]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  const exportAs = (kind: 'xlsx' | 'pptx') => run(async () => {
    setBusy(kind);
    try { await download(`/analytics/export.${kind}${query ? `?${query}` : ''}`, `notam-ringkasan-eksekutif-${ymd(new Date())}.${kind}`); } finally { setBusy(''); }
  });

  const k = a?.kpi;
  const pk = a?.previous?.kpi;
  const status = a ? Object.entries(a.status).map(([s, n]) => ({ label: STATUS_LABEL[s] ?? s, value: n, color: STATUS_COLOR[s] ?? '#66758a', pick: s })) : [];
  const v = a?.ai.validation ?? {};
  const sub = (key: 'submitted' | 'approved') => (a ? a.series.map((p) => p[key]) : []);
  const h1 = (n: number | null) => Math.round((n ?? 0) * 10) / 10;
  const outcome = (x: { n: number; approved: number; rejected: number }): Part[] => [
    { label: 'Disetujui', v: x.approved, color: C.green }, { label: 'Ditolak', v: x.rejected, color: C.red }, { label: 'Lainnya', v: Math.max(0, x.n - x.approved - x.rejected), color: C.pale },
  ];
  return (
    <TipCtx.Provider value={showTip}>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Periode">
          {PRESETS.map(([key, label]) => <button key={key} className={preset === key ? 'on' : ''} onClick={() => setPreset(key)}>{label}</button>)}
        </div>
        {preset === 'custom' && (
          <>
            <label className="date">Dari <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></label>
            <label className="date">Sampai <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></label>
          </>
        )}
        <input aria-label="Bandara" placeholder="Bandara (mis. WIHH)" maxLength={4} value={airport} onChange={(e) => setAirport(e.target.value.toUpperCase())} />
        <span className="grow" />
        <button className="ghost" disabled={!!busy || !a} onClick={() => exportAs('xlsx')}>{busy === 'xlsx' ? 'Menyiapkan…' : 'Unduh Excel'}</button>
        <button disabled={!!busy || !a} onClick={() => exportAs('pptx')}>{busy === 'pptx' ? 'Menyiapkan…' : 'Unduh PowerPoint'}</button>
      </div>
      {error && <p role="alert">{error}</p>}
      {!a || !k ? (!error && <p className="muted">Memuat…</p>) : (
        <div className="dash">
          <div className="cards kpis span-12">
            <Kpi value={String(k.total)} label="Total pengajuan" delta={<Delta cur={k.total} prev={pk?.total} kind="count" good="up" />} spark={<Spark values={sub('submitted')} />} />
            <Kpi value={String(k.approved)} label="Disetujui NOF" tone="c-ok" delta={<Delta cur={k.approved} prev={pk?.approved} kind="count" good="up" />} onClick={() => open("NOTAM disetujui NOF", "status", "APPROVED_BY_NOF")} spark={<Spark values={sub('approved')} color={C.green} />} />
            <Kpi value={String(k.rejected)} label="Ditolak" tone="c-reject" delta={<Delta cur={k.rejected} prev={pk?.rejected} kind="count" good="down" />} onClick={() => open("NOTAM ditolak", "status", "REJECTED")} />
            <Kpi value={String(k.inReview + k.needsRevision)} label="Masih berjalan" sub={`${k.inReview} review · ${k.needsRevision} revisi`} tone="c-review" />
            <Kpi value={fmtPct(k.approvalRate)} label="Tingkat persetujuan" sub={`${fmtPct(k.firstPassRate)} tanpa revisi`} tone="c-ok" delta={<Delta cur={k.approvalRate} prev={pk?.approvalRate} kind="rate" good="up" />} />
            <Kpi value={fmtDuration(k.avgTurnaroundH)} label="Rata-rata waktu selesai" sub={`median ${fmtDuration(k.medianTurnaroundH)}`} delta={<Delta cur={k.avgTurnaroundH} prev={pk?.avgTurnaroundH} kind="dur" good="down" />} />
            <Kpi value={fmtPct(k.revisionRate)} label="Tingkat revisi" sub={`${k.revisedDocs} dari ${k.submitted} pengajuan`} tone="c-revise" delta={<Delta cur={k.revisionRate} prev={pk?.revisionRate} kind="rate" good="down" />} />
            <Kpi value={fmtPct(k.rejectionRate)} label="Tingkat penolakan" sub="dari yang sudah selesai" tone="c-reject" delta={<Delta cur={k.rejectionRate} prev={pk?.rejectionRate} kind="rate" good="down" />} />
            <Kpi value={String(k.pendingOver24h)} label="Menunggu > 24 jam" tone={k.pendingOver24h ? 'c-reject' : 'c-ok'} />
            <Kpi value={fmtPct(k.aiPassRate)} label="Lolos validasi AI" sub={`${fmtPct(k.correctedRate)} dikoreksi sistem`} />
          </div>

          <section className="panel span-12 insight-panel">
            <h3>Ringkasan eksekutif</h3>
            <p className="muted">Diperbarui {fmtDateTime(a.period.generatedAt)} · Draft tidak dihitung{a.previous ? ` · Pembanding: ${new Date(a.previous.from).toLocaleDateString('id-ID')} – ${new Date(a.previous.to).toLocaleDateString('id-ID')}` : ' · Pilih periode selain "Semua" untuk melihat perbandingan'}</p>
            <ul className="insights">{a.insights.map((t) => <li key={t}>{t}</li>)}</ul>
          </section>

          <section className="panel span-8">
            <h3>Tren pengajuan per {a.granularity === 'day' ? 'hari' : 'bulan'}</h3>
            {a.series.length ? <AreaChart series={a.series} granularity={a.granularity} onPick={(p) => open(`NOTAM dibuat pada ${p}`, 'period', p)} /> : <p className="muted">Belum ada data pada periode ini.</p>}
          </section>
          <section className="panel span-4"><h3>Status saat ini</h3>{status.length ? <Donut data={status} onPick={(k2) => open(`Status: ${STATUS_LABEL[k2] ?? k2}`, 'status', k2)} /> : <p className="muted">Belum ada data.</p>}</section>

          <section className="panel span-4"><h3>Funnel persetujuan</h3><Bars rows={a.funnel.map((f) => ({ label: f.label, value: f.n }))} /></section>
          <section className="panel span-4">
            <h3>Indikator mutu</h3>
            <div className="rings">
              <Ring value={k.approvalRate} label="Disetujui" color={C.green} hint="disetujui dibanding yang sudah selesai" />
              <Ring value={k.firstPassRate} label="Tanpa revisi" color={C.blue} hint="disetujui tanpa pernah dikembalikan" />
              <Ring value={k.aiPassRate} label="Lolos AI" color={C.teal} hint="hasil AI langsung lolos validasi" />
              <Ring value={k.correctedRate} label="Dikoreksi" color={C.amber} hint="dikoreksi otomatis oleh sistem" />
            </div>
          </section>

          <section className="panel span-4">
            <h3>Sebaran FIR</h3>
            {a.fir.length ? <Donut data={a.fir.map((f, i) => ({ label: f.fir, value: f.n, color: PAL[i % PAL.length], pick: f.fir }))} onPick={(f) => open(`NOTAM di FIR ${f}`, 'fir', f)} /> : <p className="muted">Belum ada data.</p>}
          </section>

          <section className="panel span-6">
            <h3>Radar kesehatan operasi</h3>
            <Radar cur={radarAxes(k, a.stages)} prev={a.previous ? radarAxes(a.previous.kpi, a.previous.stages) : null} />
            <p className="muted">Skor 0–100, makin besar makin sehat. Sorot sebuah titik untuk melihat artinya. Garis putus-putus = periode sebelumnya yang sama panjang.</p>
          </section>
          <section className="panel span-6">
            <h3>Cara membaca radar</h3>
            <table className="mini">
              <thead><tr><th>Sumbu</th><th>Skor</th><th>Arti</th></tr></thead>
              <tbody>{radarAxes(k, a.stages).map((x) => <tr key={x.key}><td>{x.key}</td><td>{x.value === null ? '–' : x.value}</td><td>{x.def}</td></tr>)}</tbody>
            </table>
            <p className="muted">Skor kecepatan memakai batas 24 jam yang sama dengan penanda antrean, bukan SLA resmi AirNav. Sumbu tanpa data ditampilkan "–".</p>
          </section>

          <section className="panel span-6">
            <h3>Lama tinggal per tahap (jam)</h3>
            <Columns rows={a.stages.map((s) => ({ label: s.stage, parts: [{ label: 'Rata-rata', v: h1(s.avgH), color: C.blue }, { label: 'Terlama', v: h1(s.maxH), color: C.pale }] }))} />
          </section>
          <section className="panel span-6">
            <h3>Antrean saat ini per tahap</h3>
            <Columns rows={a.pending.map((p) => ({ label: p.stage, parts: [{ label: 'Antre', v: p.n, color: C.sky }, { label: '> 24 jam', v: p.over24h, color: C.red }] }))} onPick={(st) => open(`Antre di tahap ${st}`, 'stage', st)} />
          </section>

          <section className="panel span-6">
            <h3>Bandara teratas</h3>
            <Stacked rows={a.airports.map((x) => ({ label: x.airport, title: x.name, parts: outcome(x) }))} onPick={(ap) => open(`NOTAM bandara ${ap}`, 'airport', ap)} />
          </section>
          <section className="panel span-6">
            <h3>Kode Q teratas</h3>
            <Bars rows={a.qcodes.map((q) => ({ label: q.code, value: q.n, text: `${q.n} · ${q.label}`, pick: q.code }))} color={C.teal} onPick={(c) => open(`Kode Q ${c}`, 'qcode', c)} />
          </section>

          <section className="panel span-4">
            <h3>Kualitas hasil AI</h3>
            <Donut data={[{ label: 'Lolos', value: v.passed ?? 0, color: C.green, pick: 'passed' }, { label: 'Peringatan', value: v.warning ?? 0, color: C.amber, pick: 'warning' }, { label: 'Gagal', value: v.failed ?? 0, color: C.red, pick: 'failed' }]} onPick={(k2) => open(`Validasi AI: ${k2}`, 'validation', k2)} />
            <p className="muted">Dibuat ulang {fmtPct(k.regenRate)} · rata-rata generate {k.avgGenSec === null ? '–' : `${k.avgGenSec.toFixed(1).replace('.', ',')} dtk`}{a.ai.providers.length ? ` · ${a.ai.providers.map((p) => `${p.provider} (${p.n})`).join(', ')}` : ''}</p>
          </section>
          <section className="panel span-4">
            <h3>Pengembalian per role</h3>
            <Columns rows={a.returns.map((r) => ({ label: r.role, parts: [{ label: 'Revisi', v: r.revise, color: C.amber }, { label: 'Tolak', v: r.reject, color: C.red }] }))} />
          </section>

          <section className="panel span-4">
            <h3>Pengusul teratas</h3>
            <Stacked rows={a.originators.map((o) => ({ label: o.originator, parts: outcome(o) }))} onPick={(og) => open(`NOTAM dari ${og}`, 'originator', og)} />
          </section>
          <section className="panel span-12">
            <h3>Rincian lama tinggal per tahap</h3>
            <table className="mini">
              <thead><tr><th>Tahap</th><th>Sampel</th><th>Rata-rata</th><th>Median</th><th>Terlama</th></tr></thead>
              <tbody>{a.stages.map((s) => <tr key={s.stage}><td>{s.stage}</td><td>{s.n}</td><td>{fmtDuration(s.avgH)}</td><td>{fmtDuration(s.medianH)}</td><td>{fmtDuration(s.maxH)}</td></tr>)}</tbody>
            </table>
            <p className="muted">Sampel = tahap yang sudah selesai.</p>
          </section>
        </div>
      )}
      {tip && <div className="tip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 280), top: tip.y + 16 }}>{tip.text}</div>}
      {drill && <Drill title={drill.title} path="/analytics/drill" query={`${query}${query ? '&' : ''}dim=${drill.dim}&value=${encodeURIComponent(drill.value)}`} onClose={() => setDrill(null)} />}
    </TipCtx.Provider>
  );
}
