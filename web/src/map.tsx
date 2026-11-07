import { Fragment, PointerEvent as RPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from './admin';
import { api } from './api';
import { MAP_H, MAP_W, NEIGHBORS, OUTLINE, project } from './indonesia-outline';
import { fmtDate, useAsync } from './util';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft', UNDER_ATS: 'Review ATS', UNDER_PIA: 'Review PIA', UNDER_NOF: 'Review NOF',
  REVISION_REQUIRED: 'Perlu revisi', REJECTED: 'Ditolak', APPROVED_BY_NOF: 'Disetujui NOF',
};
const STATE_LABEL: Record<string, string> = { active: 'Sedang berlaku', upcoming: 'Akan berlaku', expired: 'Sudah berakhir' };
const TONE_COLOR: Record<string, string> = { bad: '#b83232', wait: '#f2a900', ok: '#17784f', draft: '#66758a', none: '#b9c3d0' };
const TONE_LABEL: Record<string, string> = { bad: 'Ada yang ditolak atau perlu revisi', wait: 'Ada yang masih dalam review', ok: 'Semua disetujui NOF', none: 'Tidak ada NOTAM' };

interface Point { airport: string; name: string; city: string; fir: string; lat: number; lon: number; n: number; counts: Record<string, number>; tone: string }
interface Overview { total: number; points: Point[]; noCoord: number; noCoordAirports: number }
interface Item { formNo: string; status: string; createdAt: string; qcode: string; text: string; validFrom: string | null; validTo: string | null; perm: boolean; state: string | null; mine: boolean }
interface AirportData { airport: { code: string; name: string; city: string; fir: string }; total: number; counts: Record<string, number>; timeline: { day: string; n: number }[]; page: number; pages: number; items: Item[] }
interface Detail {
  formNo: string; airport: string; airportName: string; status: string; createdAt: string; generated: string;
  validFrom: string | null; validTo: string | null; perm: boolean; state: string | null;
  originator?: string; prompt?: string; validation?: string | null;
  events?: { actor: string; role: string; action: string; to: string; at: string; note?: string }[];
}

type Preset = 'today' | '7' | '30' | 'month' | 'all' | 'custom';
const PRESETS: [Preset, string][] = [['today', 'Hari ini'], ['7', '7 hari'], ['30', '30 hari'], ['month', 'Bulan ini'], ['all', 'Semua'], ['custom', 'Kustom']];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const utc = (s: string | null) => (s ? `${new Date(s).toISOString().replace('T', ' ').slice(0, 16)} UTC` : '–');
const ACTION: Record<string, string> = { SUBMIT: 'Submit', ACCEPT: 'Accept', REVISE: 'Revisi', REJECT: 'Reject' };

function validityText(i: { validFrom: string | null; validTo: string | null; perm: boolean }) {
  if (!i.validFrom) return 'Masa berlaku tidak terbaca';
  return `${utc(i.validFrom)} sampai ${i.perm ? 'PERM' : utc(i.validTo)}`;
}

export function MapPanel() {
  const [preset, setPreset] = useState<Preset>('30');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [by, setBy] = useState<'created' | 'validity'>('created');
  const [status, setStatus] = useState('');
  const [fir, setFir] = useState('');
  const [state, setState] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [firs, setFirs] = useState<string[]>([]);
  const [data, setData] = useState<Overview | null>(null);
  const [sel, setSel] = useState('');
  const { error, run } = useAsync();

  const query = useMemo(() => {
    const p: Record<string, string> = { by };
    const now = new Date();
    const startOf = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const endOf = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
    if (preset === 'custom') {
      if (custom.from) p.from = new Date(`${custom.from}T00:00:00`).toISOString();
      if (custom.to) p.to = new Date(`${custom.to}T23:59:59.999`).toISOString();
    } else if (preset !== 'all') {
      const from = preset === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1) : startOf(new Date(now.getTime() - (preset === 'today' ? 0 : Number(preset)) * 86_400_000));
      p.from = from.toISOString();
      p.to = endOf(now).toISOString();
    }
    if (status) p.status = status;
    if (fir) p.fir = fir;
    if (state) p.state = state;
    return new URLSearchParams(p).toString();
  }, [preset, custom, by, status, fir, state]);

  useEffect(() => {
    const t = setTimeout(() => run(async () => {
      const r = await api<Overview>('GET', `/map?${query}${showAll ? '&all=1' : ''}`);
      setData(r);
      if (!fir) setFirs([...new Set(r.points.map((p) => p.fir).filter(Boolean))].sort());
    }), 150);
    return () => clearTimeout(t);
  }, [query, showAll]);

  const pickDay = (day: string) => { setCustom({ from: day, to: day }); setPreset('custom'); };
  const filterText = [
    PRESETS.find(([k]) => k === preset)?.[1], by === 'validity' ? 'menurut masa berlaku' : 'menurut tanggal pengajuan',
    status && STATUS_LABEL[status], fir && `FIR ${fir}`, state && STATE_LABEL[state],
  ].filter(Boolean).join(' · ');

  return (
    <>
      <div className="toolbar mp-toolbar">
        <div className="seg" role="group" aria-label="Periode">
          {PRESETS.map(([key, label]) => <button key={key} className={preset === key ? 'on' : ''} onClick={() => setPreset(key)}>{label}</button>)}
        </div>
        {preset === 'custom' && (
          <>
            <label className="date">Dari <input type="date" value={custom.from} max={custom.to || undefined} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></label>
            <label className="date">Sampai <input type="date" value={custom.to} min={custom.from || undefined} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></label>
          </>
        )}
        <label className="date">Berdasarkan
          <select value={by} onChange={(e) => setBy(e.target.value as 'created' | 'validity')}>
            <option value="created">Tanggal pengajuan</option><option value="validity">Masa berlaku (B–C)</option>
          </select>
        </label>
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Semua status</option>
          {Object.entries(STATUS_LABEL).filter(([k]) => k !== 'DRAFT').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select aria-label="FIR" value={fir} onChange={(e) => setFir(e.target.value)}>
          <option value="">Semua FIR</option>
          {(fir && !firs.includes(fir) ? [...firs, fir] : firs).map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select aria-label="Masa berlaku" value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">Semua masa berlaku</option>
          {Object.entries(STATE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Tampilkan semua bandara</label>
      </div>
      <p className="muted mp-note">Tanggal dihitung menurut zona waktu perangkat Anda; jam NOTAM selalu UTC. Filter masa berlaku hanya berlaku untuk NOTAM yang sudah disetujui NOF.</p>
      {error && <p role="alert">{error}</p>}
      {!data ? !error && <p className="muted">Memuat…</p> : (
        <div className={`mp-layout${sel ? ' has-panel' : ''}`}>
          <section className="panel mp-map">
            <div className="mp-head">
              <h3>Peta sebaran NOTAM</h3>
              <span className="muted">{data.total} NOTAM di {data.points.filter((p) => p.n > 0).length} bandara</span>
            </div>
            <MapView points={data.points} sel={sel} onPick={setSel} />
            <div className="legend mp-legend">
              {['bad', 'wait', 'ok', ...(showAll ? ['none'] : [])].map((t) => <span key={t}><i style={{ background: TONE_COLOR[t] }} />{TONE_LABEL[t]}</span>)}
              <span className="muted">Ukuran titik = jumlah NOTAM</span>
            </div>
            {data.noCoord > 0 && <p className="muted mp-note">{data.noCoord} NOTAM di {data.noCoordAirports} bandara tidak tampil di peta karena koordinat bandara belum tersedia di data master.</p>}
            {!OUTLINE.length && <p className="muted mp-note">Garis pantai peta belum dimuat; titik bandara tetap akurat pada koordinatnya.</p>}
          </section>
          {sel && <AirportPanel key={sel} code={sel} query={query} filterText={filterText} onDay={pickDay} onClose={() => setSel('')} />}
        </div>
      )}
    </>
  );
}

function MapView({ points, sel, onPick }: { points: Point[]; sel: string; onPick: (code: string) => void }) {
  const [view, setView] = useState({ x: 0, y: 0, w: MAP_W });
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ px: number; py: number; vx: number; vy: number; moved: boolean } | null>(null);
  const wasDrag = useRef(false);
  const h = (view.w * MAP_H) / MAP_W;
  const zoom = MAP_W / view.w;

  const zoomAt = useCallback((factor: number, fx = 0.5, fy = 0.5) => setView((v) => {
    const w = Math.min(MAP_W, Math.max(MAP_W / 40, v.w / factor));
    const hh = (w * MAP_H) / MAP_W, vh = (v.w * MAP_H) / MAP_W;
    const x = v.x + (v.w - w) * fx, y = v.y + (vh - hh) * fy;
    return { w, x: Math.min(MAP_W - w, Math.max(0, x)), y: Math.min(MAP_H - hh, Math.max(0, y)) };
  }), []);

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.25 : 0.8, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [zoomAt]);

  const down = (e: RPointerEvent<SVGSVGElement>) => { wasDrag.current = false; drag.current = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y, moved: false }; };
  const move = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current, el = svg.current;
    if (!d || !el) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - d.px, dy = e.clientY - d.py;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 4) { d.moved = true; wasDrag.current = true; el.setPointerCapture(e.pointerId); }
    if (!d.moved) return;
    setTip(null);
    setView((v) => ({ ...v, x: Math.min(MAP_W - v.w, Math.max(0, d.vx - (dx / r.width) * v.w)), y: Math.min(MAP_H - h, Math.max(0, d.vy - (dy / r.height) * h)) }));
  };
  const up = (e: RPointerEvent<SVGSVGElement>) => { if (drag.current?.moved && svg.current?.hasPointerCapture(e.pointerId)) svg.current.releasePointerCapture(e.pointerId); drag.current = null; };

  const radius = (n: number) => (n === 0 ? 2 : 3.5 + Math.sqrt(n) * 2.2) / Math.pow(zoom, 0.6);
  const grid: number[] = [];
  for (let lon = 95; lon <= 141; lon += 5) grid.push(lon);
  const lats = [5, 0, -5, -10];

  return (
    <div className="mp-wrap">
      <div className="mp-zoom" role="group" aria-label="Zoom peta">
        <button aria-label="Perbesar" onClick={() => zoomAt(1.5)}>+</button>
        <button aria-label="Perkecil" onClick={() => zoomAt(1 / 1.5)}>−</button>
        <button aria-label="Atur ulang" onClick={() => setView({ x: 0, y: 0, w: MAP_W })}>⌂</button>
      </div>
      <svg ref={svg} className="mp-svg" viewBox={`${view.x} ${view.y} ${view.w} ${h}`} role="img" aria-label="Peta sebaran NOTAM per bandara"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <rect x="0" y="0" width={MAP_W} height={MAP_H} className="mp-sea" />
        {grid.map((lon) => <line key={lon} x1={project(0, lon)[0]} x2={project(0, lon)[0]} y1="0" y2={MAP_H} className="mp-grid" />)}
        {lats.map((lat) => <line key={lat} y1={project(lat, 94)[1]} y2={project(lat, 94)[1]} x1="0" x2={MAP_W} className="mp-grid" />)}
        {NEIGHBORS.map((d, i) => <path key={`n${i}`} d={d} className="mp-other" />)}
        {OUTLINE.map((d, i) => <path key={i} d={d} className="mp-land" />)}
        {[...points].reverse().map((p) => {
          const [x, y] = project(p.lat, p.lon);
          const on = p.airport === sel;
          const label = `${p.airport} · ${p.name} (${p.city}) · ${p.n} NOTAM`;
          return (
            <circle key={p.airport} cx={x} cy={y} r={radius(p.n)} fill={TONE_COLOR[p.tone]} fillOpacity={p.n ? 0.85 : 0.6} stroke={on ? '#0b2545' : '#fff'} strokeWidth={(on ? 2 : 0.8) / Math.pow(zoom, 0.6)}
              className="mp-dot" tabIndex={0} role="button" aria-label={label}
              onClick={() => { if (!wasDrag.current) onPick(p.airport); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(p.airport); } }}
              onPointerEnter={(e) => setTip({ text: label, x: e.clientX, y: e.clientY })} onPointerMove={(e) => !drag.current && setTip({ text: label, x: e.clientX, y: e.clientY })} onPointerLeave={() => setTip(null)} />
          );
        })}
      </svg>
      {tip && <div className="tip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 300), top: tip.y + 16 }}>{tip.text}</div>}
    </div>
  );
}

function AirportPanel({ code, query, filterText, onDay, onClose }: { code: string; query: string; filterText: string; onDay: (day: string) => void; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AirportData | null>(null);
  const [open, setOpen] = useState('');
  const { error, run } = useAsync();
  useEffect(() => { setPage(1); }, [query]);
  useEffect(() => { run(async () => setData(await api<AirportData>('GET', `/map/airport/${code}?${query}&page=${page}&pageSize=10`))); }, [code, query, page]);

  const groups = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of data?.items ?? []) { const k = ymd(new Date(i.createdAt)); m.set(k, [...(m.get(k) ?? []), i]); }
    return [...m.entries()];
  }, [data]);
  const max = Math.max(1, ...(data?.timeline ?? []).map((t) => t.n));

  return (
    <aside className="panel mp-side" aria-label={`NOTAM bandara ${code}`}>
      <div className="mp-head">
        <div>
          <h3>{data?.airport.name || code}</h3>
          <span className="muted"><span className="mono">{code}</span>{data?.airport.city && ` · ${data.airport.city}`}{data?.airport.fir && ` · FIR ${data.airport.fir}`}</span>
        </div>
        <button className="ghost sm" onClick={onClose} aria-label="Tutup panel">Tutup</button>
      </div>
      <p className="muted mp-note">Filter aktif: {filterText}</p>
      {error && <p role="alert">{error}</p>}
      {!data ? !error && <p className="muted">Memuat…</p> : (
        <>
          <div className="mp-counts">
            <span className="pill">{data.total} NOTAM</span>
            {Object.entries(data.counts).map(([s, n]) => <span key={s} className={`pill s-${s}`}>{STATUS_LABEL[s] ?? s}: {n}</span>)}
          </div>
          {data.timeline.length > 0 && (
            <div className="mp-timeline" role="group" aria-label="Jumlah NOTAM per hari; klik batang untuk menyaring ke hari itu">
              {data.timeline.slice(-40).map((t) => <button key={t.day} style={{ height: `${Math.max(10, (t.n / max) * 100)}%` }} title={`${fmtDate(t.day)}: ${t.n} NOTAM (klik untuk menyaring hari ini)`} aria-label={`${t.day}: ${t.n} NOTAM`} onClick={() => onDay(t.day)} />)}
            </div>
          )}
          {!data.items.length && <p className="muted">Tidak ada NOTAM pada filter ini.</p>}
          {groups.map(([day, list]) => (
            <details key={day} open className="mp-group">
              <summary>{fmtDate(day)} <span className="muted">({list.length})</span></summary>
              {list.map((i) => (
                <button key={i.formNo} className="mp-item" onClick={() => setOpen(i.formNo)}>
                  <span className="mp-item-top"><span className="mono">{i.formNo}</span><span className={`pill s-${i.status}`}>{STATUS_LABEL[i.status] ?? i.status}</span>{i.state && <span className={`pill st-${i.state}`}>{STATE_LABEL[i.state]}</span>}{i.qcode && <span className="mono muted">{i.qcode}</span>}</span>
                  <span className="mono mp-item-text">{i.text || '(isi E tidak terbaca)'}</span>
                  <span className="muted mp-item-val">{validityText(i)}</span>
                </button>
              ))}
            </details>
          ))}
          {data.pages > 1 && (
            <div className="mp-pager">
              <button className="ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Sebelumnya</button>
              <span className="muted">Halaman {data.page} dari {data.pages}</span>
              <button className="ghost sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Berikutnya</button>
            </div>
          )}
        </>
      )}
      {open && <DetailModal formNo={open} onClose={() => setOpen('')} />}
    </aside>
  );
}

function DetailModal({ formNo, onClose }: { formNo: string; onClose: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const { error, run } = useAsync();
  useEffect(() => { run(async () => setD(await api<Detail>('GET', `/map/notam/${encodeURIComponent(formNo)}`))); }, [formNo]);
  return (
    <Modal title={`NOTAM ${formNo}`} onClose={onClose} wide>
      {error && <p role="alert">{error}</p>}
      {!d ? !error && <p className="muted">Memuat…</p> : (
        <>
          <p>
            <span className={`pill s-${d.status}`}>{STATUS_LABEL[d.status] ?? d.status}</span>{' '}
            {d.state && <span className={`pill st-${d.state}`}>{STATE_LABEL[d.state]}</span>}{' '}
            <span className="muted">{d.airport}{d.airportName && ` · ${d.airportName}`} · diajukan {fmtDate(d.createdAt)}</span>
          </p>
          <div className="compare">
            {d.prompt !== undefined && <div><h3>Pesan asli</h3><p className="prompt">{d.prompt}</p></div>}
            <div><h3>NOTAM</h3><pre>{d.generated}</pre><p className="muted">Masa berlaku: {validityText(d)}</p></div>
          </div>
          {d.events && d.events.length > 0 && (
            <>
              <h3>Riwayat proses</h3>
              <ul className="events">
                {d.events.map((e, i) => <Fragment key={i}><li>{new Date(e.at).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · {e.actor} ({e.role}) {ACTION[e.action] ?? e.action} → {STATUS_LABEL[e.to] ?? e.to}{e.note ? ` — ${e.note}` : ''}</li></Fragment>)}
              </ul>
            </>
          )}
          {d.prompt === undefined && <p className="muted">Pesan asli dan riwayat hanya terlihat oleh pembuat dan peninjau.</p>}
        </>
      )}
      <div className="row end"><button className="ghost" onClick={onClose}>Tutup</button></div>
    </Modal>
  );
}
