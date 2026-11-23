import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from './admin';
import { Bars, Donut, Kpi } from './analytics';
import { ImpactKey, TypeItem, TypesReport, api, download } from './api';
import { fmtDate, fmtPct, useAsync } from './util';

const PAL = ['#1769c2', '#f2a900', '#17784f', '#b83232', '#8fb8e8', '#7c6fd0', '#66758a'];
const STATUS_LABEL: Record<string, string> = {
  UNDER_ATS: 'Review ATS', UNDER_PIA: 'Review PIA', UNDER_NOF: 'Review NOF',
  REVISION_REQUIRED: 'Perlu revisi', REJECTED: 'Ditolak', APPROVED_BY_NOF: 'Disetujui NOF',
};
// Dampak operasional (pengelompokan dari kode kondisi Q): warna dan versi transparan untuk sel heatmap.
const IMPACT_ORDER: ImpactKey[] = ['CLOSED', 'LIMITED', 'NORMAL', 'OTHER'];
const IMPACT_LABEL: Record<ImpactKey, string> = { CLOSED: 'Tidak bisa dipakai', LIMITED: 'Dipakai dengan pembatasan', NORMAL: 'Kembali normal', OTHER: 'Lainnya' };
const IMPACT_TONE: Record<ImpactKey, string> = { CLOSED: 'c-reject', LIMITED: 'c-revise', NORMAL: 'c-ok', OTHER: 'c-review' };
const IMPACT_RGB: Record<ImpactKey, string> = { CLOSED: '184, 50, 50', LIMITED: '242, 169, 0', NORMAL: '23, 120, 79', OTHER: '102, 117, 138' };
type Preset = '7' | '30' | '90' | 'year' | 'all' | 'custom';
const PRESETS: [Preset, string][] = [['7', '7 hari'], ['30', '30 hari'], ['90', '90 hari'], ['year', 'Tahun ini'], ['all', 'Semua'], ['custom', 'Kustom']];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Batang bertumpuk per periode, satu warna per kelompok.
function StackedBars({ report, names }: { report: TypesReport; names: Record<string, string> }) {
  const { keys, series } = report.trend;
  const W = 760, H = 250, L = 34, R = 10, T = 12, B = 30;
  const totals = series.map((s) => keys.reduce((a, k) => a + (s.counts[k] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const top = max <= 4 ? max : Math.ceil(max / 4) * 4;
  const slot = (W - L - R) / Math.max(1, series.length);
  const bw = Math.max(3, Math.min(34, slot * 0.7));
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const every = Math.max(1, Math.ceil(series.length / 10));
  const label = (p: string) => (report.granularity === 'day' ? `${p.slice(8)}/${p.slice(5, 7)}` : p);
  const ticks = [...new Set([0, 1, 2, 3, 4].map((i) => Math.round((top * i) / 4)))];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="line" role="img" aria-label="Tren NOTAM per jenis">
        {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e3e8ef" /><text x={L - 6} y={y(t) + 4} textAnchor="end">{t}</text></g>)}
        {series.map((s, i) => {
          let acc = 0;
          const x = L + slot * i + (slot - bw) / 2;
          return (
            <g key={s.period}>
              {keys.map((k, ki) => {
                const v = s.counts[k] ?? 0;
                if (!v) return null;
                const y0 = y(acc), y1 = y(acc + v);
                acc += v;
                return <rect key={k} x={x} y={y1} width={bw} height={Math.max(1, y0 - y1)} fill={PAL[ki % PAL.length]}><title>{`${s.period} · ${names[k] ?? k}: ${v}`}</title></rect>;
              })}
              {i % every === 0 && <text x={x + bw / 2} y={H - 10} textAnchor="middle">{label(s.period)}</text>}
            </g>
          );
        })}
      </svg>
      <div className="legend">{keys.map((k, i) => <span key={k}><i style={{ background: PAL[i % PAL.length] }} />{names[k] ?? k}</span>)}</div>
    </div>
  );
}

export function TypesPanel() {
  const [preset, setPreset] = useState<Preset>('30');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [airport, setAirport] = useState('');
  const [status, setStatus] = useState('');
  const [r, setR] = useState<TypesReport | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState('');
  const [drill, setDrill] = useState<{ title: string; extra: string } | null>(null);
  const [openA, setOpenA] = useState<Record<string, boolean>>({});
  const { error, run } = useAsync();

  const query = useMemo(() => {
    const p: Record<string, string> = {};
    const now = new Date();
    if (preset === 'custom') {
      if (custom.from) p.from = new Date(`${custom.from}T00:00:00`).toISOString();
      if (custom.to) p.to = new Date(`${custom.to}T23:59:59.999`).toISOString();
    } else if (preset === 'year') p.from = new Date(now.getFullYear(), 0, 1).toISOString();
    else if (preset !== 'all') { const f = new Date(now); f.setDate(f.getDate() - Number(preset)); f.setHours(0, 0, 0, 0); p.from = f.toISOString(); }
    if (/^[A-Z]{4}$/.test(airport)) p.airport = airport;
    if (status) p.status = status;
    return new URLSearchParams(p).toString();
  }, [preset, custom, airport, status]);

  const load = useCallback(() => run(async () => setR(await api<TypesReport>('GET', `/analytics/types${query ? `?${query}` : ''}`))), [query]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  const exportAs = (kind: 'xlsx' | 'pptx') => run(async () => {
    setBusy(kind);
    try { await download(`/analytics/types/export.${kind}${query ? `?${query}` : ''}`, `notam-laporan-jenis-${ymd(new Date())}.${kind}`); } finally { setBusy(''); }
  });

  const names = useMemo<Record<string, string>>(() => ({ ...Object.fromEntries((r?.groups ?? []).map((g) => [g.group, g.name])), Lain: 'Lain-lain' }), [r]);
  const top = r?.groups[0];
  const cond = r?.conditions[0];
  const airportFiltered = /^[A-Z]{4}$/.test(airport);
  const maxImp = Math.max(1, ...(r?.impactMatrix.flatMap((m) => Object.values(m.counts)) ?? [1]));
  const maxCell = Math.max(1, ...(r?.matrix.rows.flatMap((m) => Object.values(m.counts)) ?? [1]));

  return (
    <>
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
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Semua status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="grow" />
        <button className="ghost" disabled={!!busy || !r} onClick={() => exportAs('xlsx')}>{busy === 'xlsx' ? 'Menyiapkan…' : 'Unduh Excel'}</button>
        <button disabled={!!busy || !r} onClick={() => exportAs('pptx')}>{busy === 'pptx' ? 'Menyiapkan…' : 'Unduh PowerPoint'}</button>
      </div>
      {error && <p role="alert">{error}</p>}
      {!r ? (!error && <p className="muted">Memuat…</p>) : (
        <>
          <section>
            <h2>Laporan menurut jenis NOTAM</h2>
            <p className="muted">Jenis dibaca dari kode Q hasil susunan terakhir. Draft tidak dihitung.</p>
            <ul className="insights">{r.insights.map((t) => <li key={t}>{t}</li>)}</ul>
          </section>

          <div className="cards kpis">
            <Kpi value={String(r.total)} label="Total NOTAM" sub={`${r.coded} dengan kode Q terbaca`} />
            <Kpi value={String(r.groups.length)} label="Kelompok jenis" tone="c-review" />
            <Kpi value={top ? fmtPct(top.share) : '–'} label={top ? top.name : 'Jenis terbanyak'} sub={top ? `${top.n} NOTAM` : undefined} tone="c-ok" />
            <Kpi value={cond ? fmtPct(cond.share) : '–'} label={cond ? `Kondisi: ${cond.label ?? cond.code}` : 'Kondisi terbanyak'} sub={cond ? `${cond.n} NOTAM` : undefined} tone="c-revise" />
          </div>

          <div className="panels">
            <section>
              <h3>Kelompok jenis</h3>
              {r.groups.length ? <Donut data={r.groups.map((g, i) => ({ label: g.name, value: g.n, color: PAL[i % PAL.length] }))} /> : <p className="muted">Belum ada NOTAM dengan kode Q.</p>}
            </section>
            <section>
              <h3>Kondisi</h3>
              <Bars rows={r.conditions.slice(0, 8).map((c) => ({ label: c.label ?? c.code, value: c.n, text: `${c.n} · ${fmtPct(c.share)}` }))} />
            </section>
          </div>

          <section>
            <h3>Dampak operasional</h3>
            <p className="muted">Dikelompokkan dari kode kondisi Q. Klik kartu atau angka untuk melihat daftar NOTAM-nya.</p>
            <div className="cards kpis">
              {IMPACT_ORDER.map((k) => {
                const i = r.impact.find((x) => x.key === k);
                return (
                  <button key={k} className={`card ${IMPACT_TONE[k]}`} disabled={!i?.n} onClick={() => setDrill({ title: IMPACT_LABEL[k], extra: `impact=${k}` })}>
                    <span className="num">{i?.n ?? 0}</span>
                    <span className="lbl">{IMPACT_LABEL[k]}</span>
                    {i ? <span className="sub">{fmtPct(i.share)}</span> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h3>Subjek dan dampak</h3>
            {r.impactMatrix.length === 0 ? <p className="muted">Belum ada data.</p> : (
              <table className="mini heat">
                <thead><tr><th>Subjek</th>{IMPACT_ORDER.map((k) => <th key={k}>{IMPACT_LABEL[k]}</th>)}<th>Total</th></tr></thead>
                <tbody>
                  {r.impactMatrix.map((m) => (
                    <tr key={m.subject}>
                      <td data-label="Subjek"><b>{m.label ?? m.subject}</b>{m.label && <span className="mono muted"> {m.subject}</span>}</td>
                      {IMPACT_ORDER.map((k) => {
                        const v = m.counts[k];
                        return (
                          <td key={k} data-label={IMPACT_LABEL[k]} className="cell" style={{ background: v ? `rgba(${IMPACT_RGB[k]}, ${0.12 + 0.6 * (v / maxImp)})` : undefined }}>
                            {v ? <button className="linkish" onClick={() => setDrill({ title: `${m.label ?? m.subject} · ${IMPACT_LABEL[k]}`, extra: `subject=${m.subject}&impact=${k}` })}>{v}</button> : ''}
                          </td>
                        );
                      })}
                      <td data-label="Total"><b>{m.total}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="muted">Sepuluh subjek teratas. Pengelompokan dampak dibuat sistem dari kode kondisi, bukan istilah resmi AirNav.</p>
          </section>

          <section>
            <h3>Rincian per bandara</h3>
            {r.airportDetail.length === 0 ? <p className="muted">Belum ada data.</p> : (
              <table className="mini types">
                <thead><tr><th>Bandara</th><th>Total</th>{IMPACT_ORDER.map((k) => <th key={k}>{IMPACT_LABEL[k]}</th>)}</tr></thead>
                <tbody>
                  {r.airportDetail.map((a) => (
                    <Fragment key={a.airport}>
                      <tr className="grp-row">
                        <td data-label="Bandara">
                          <button className="ghost sm" aria-expanded={!!openA[a.airport]} onClick={() => setOpenA({ ...openA, [a.airport]: !openA[a.airport] })}>{openA[a.airport] ? 'Tutup' : 'Buka'}</button>
                          <button className="linkish" onClick={() => setDrill({ title: `${a.airport}${a.name ? ` · ${a.name}` : ''}`, extra: airportFiltered ? '' : `airport=${a.airport}` })}><b className="mono">{a.airport}</b>{a.name && <span className="muted"> {a.name}</span>}</button>
                        </td>
                        <td data-label="Total"><b>{a.total}</b></td>
                        {IMPACT_ORDER.map((k) => <td key={k} data-label={IMPACT_LABEL[k]}>{a.impact[k] || ''}</td>)}
                      </tr>
                      {openA[a.airport] && a.subjects.map((s) => (
                        <tr className="sub-row" key={s.code}>
                          <td data-label="Subjek"><button className="linkish" onClick={() => setDrill({ title: `${a.airport} · ${s.label ?? s.code}`, extra: `${airportFiltered ? '' : `airport=${a.airport}&`}subject=${s.code}` })}>{s.label ? `${s.label} (${s.code})` : <span className="mono">{s.code}</span>}</button></td>
                          <td data-label="Total">{s.n}</td>
                          {IMPACT_ORDER.map((k) => <td key={k} data-label={IMPACT_LABEL[k]}>{s.impact[k] || ''}</td>)}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
            <p className="muted">Delapan bandara dengan NOTAM terbanyak. Klik "Buka" untuk melihat rincian per subjek.</p>
          </section>

          <section>
            <h3>Rincian: kelompok, subjek, dan kondisi</h3>
            {r.groups.length === 0 ? <p className="muted">Belum ada data.</p> : (
              <table className="mini types">
                <thead><tr><th>Jenis</th><th>Jumlah</th><th>Porsi</th><th>Disetujui</th><th>Ditolak</th></tr></thead>
                <tbody>
                  {r.groups.map((g, gi) => (
                    <Fragment key={g.group}>
                      <tr className="grp-row">
                        <td data-label="Jenis">
                          <button className="ghost sm" aria-expanded={!!open[g.group]} onClick={() => setOpen({ ...open, [g.group]: !open[g.group] })}>{open[g.group] ? 'Tutup' : 'Buka'}</button>
                          <i className="sw" style={{ background: PAL[gi % PAL.length] }} />
                          <button className="linkish" onClick={() => setDrill({ title: g.name, extra: `group=${g.group}` })}><b>{g.name}</b> <span className="mono muted">{g.group}</span></button>
                        </td>
                        <td data-label="Jumlah">{g.n}</td><td data-label="Porsi">{fmtPct(g.share)}</td><td data-label="Disetujui">{g.approved}</td><td data-label="Ditolak">{g.rejected}</td>
                      </tr>
                      {open[g.group] && g.subjects.map((s) => (
                        <Fragment key={s.code}>
                          <tr className="sub-row">
                            <td data-label="Subjek"><button className="linkish" onClick={() => setDrill({ title: `${s.label ?? s.code} (${s.code})`, extra: `group=${g.group}&subject=${s.code}` })}>{s.label ? `${s.label} (${s.code})` : <span className="mono">{s.code}</span>}</button></td>
                            <td data-label="Jumlah">{s.n}</td><td data-label="Porsi">{fmtPct(s.n / r.coded)}</td><td /><td />
                          </tr>
                          {s.conditions.map((c) => (
                            <tr className="cond-row" key={c.code}>
                              <td data-label="Kondisi"><button className="linkish" onClick={() => setDrill({ title: `${s.label ?? s.code} (${s.code}) · ${c.label ?? c.code} (${c.code})`, extra: `group=${g.group}&subject=${s.code}&condition=${c.code}` })}>{c.label ? `${c.label} (${c.code})` : <span className="mono">{c.code}</span>}</button></td>
                              <td data-label="Jumlah">{c.n}</td><td data-label="Porsi">{fmtPct(c.n / r.coded)}</td><td /><td />
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
            <p className="muted">Arti subjek dan kondisi disimpulkan dari contoh item E di dataset, bukan tabel resmi AirNav; kode yang contohnya tidak tegas tampil apa adanya. Klik sebuah jenis untuk melihat daftar NOTAM-nya.</p>
          </section>

          <section>
            <h3>Tren per {r.granularity === 'day' ? 'hari' : 'bulan'} menurut kelompok</h3>
            {r.trend.series.length ? <StackedBars report={r} names={names} /> : <p className="muted">Belum ada data pada periode ini.</p>}
          </section>

          <section>
            <h3>Bandara dan jenis NOTAM</h3>
            {r.matrix.rows.length === 0 ? <p className="muted">Belum ada data.</p> : (
              <table className="mini heat">
                <thead><tr><th>Bandara</th>{r.matrix.groups.map((g) => <th key={g} title={names[g]}>{names[g] ?? g}</th>)}<th>Total</th></tr></thead>
                <tbody>
                  {r.matrix.rows.map((m) => (
                    <tr key={m.airport}>
                      <td data-label="Bandara"><b className="mono">{m.airport}</b>{m.name && <span className="muted"> {m.name}</span>}</td>
                      {r.matrix.groups.map((g) => {
                        const v = m.counts[g] ?? 0;
                        return <td key={g} data-label={names[g] ?? g} className="cell" style={{ background: v ? `rgba(23, 105, 194, ${0.1 + 0.55 * (v / maxCell)})` : undefined, color: v / maxCell > 0.6 ? '#fff' : undefined }}>{v || ''}</td>;
                      })}
                      <td data-label="Total"><b>{m.total}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
      {drill && <Drill title={drill.title} query={[query, drill.extra].filter(Boolean).join('&')} onClose={() => setDrill(null)} />}
    </>
  );
}

export function Drill({ title, query, onClose, path = '/analytics/types/list' }: { title: string; query: string; onClose: () => void; path?: string }) {
  const [data, setData] = useState<{ total: number; items: TypeItem[] } | null>(null);
  const [openId, setOpenId] = useState('');
  const { error, run } = useAsync();
  useEffect(() => { run(async () => setData(await api('GET', `${path}?${query}`))); }, [query]);
  return (
    <Modal title={title} onClose={onClose} wide>
      {error && <p role="alert">{error}</p>}
      {!data ? !error && <p className="muted">Memuat…</p> : (
        <>
          <p className="muted">{data.total} NOTAM{data.total > data.items.length ? ` (menampilkan ${data.items.length} terbaru)` : ''}. Klik sebuah baris untuk melihat NOTAM lengkap dan pesan aslinya.</p>
          <div className="drill">
            <table className="mini">
              <thead><tr><th>Nomor form</th><th>Tanggal</th><th>Bandara</th><th>Status</th><th>Kode Q</th><th>Isi NOTAM (E)</th></tr></thead>
              <tbody>
                {data.items.map((i) => (
                  <Fragment key={i.id}>
                    <tr className="clickable" aria-expanded={openId === i.id} onClick={() => setOpenId(openId === i.id ? '' : i.id)}>
                      <td className="mono">{i.formNo}</td><td>{fmtDate(i.createdAt)}</td><td className="mono">{i.airport}</td>
                      <td><span className={`pill s-${i.status}`}>{STATUS_LABEL[i.status] ?? i.status}</span></td>
                      <td className="mono">{i.qcode}</td><td className="mono">{i.text}</td>
                    </tr>
                    {openId === i.id && (
                      <tr className="open-row">
                        <td colSpan={6}>
                          <div className="compare">
                            <div><h3>Pesan asli</h3><p className="prompt">{i.prompt}</p></div>
                            <div><h3>NOTAM lengkap</h3><pre>{i.full}</pre></div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {!data.items.length && <tr><td colSpan={6} className="muted">Tidak ada NOTAM.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="row end"><button className="ghost" onClick={onClose}>Tutup</button></div>
    </Modal>
  );
}
