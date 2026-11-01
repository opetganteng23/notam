import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AuditPanel, Modal, Users } from './admin';
import { AnalyticsPanel } from './analytics';
import { TypesPanel } from './types-report';
import { KamusPanel } from './kamus';
import { Ticker } from './ticker';
import { Mark, Partners, TowerScene } from './brand';
import { Landing } from './landing';
import { Toaster, toast } from './toast';
import { GateState, NotamRequest, OpsStatus, Stats, api, download, session } from './api';
import '@fontsource-variable/inter';
import { fmtDate, fmtDateTime, fmtMs, useAsync, useElapsed } from './util';
import './style.css';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft', UNDER_ATS: 'Review ATS', UNDER_PIA: 'Review PIA', UNDER_NOF: 'Review NOF',
  REVISION_REQUIRED: 'Perlu revisi', REJECTED: 'Ditolak', APPROVED_BY_NOF: 'Disetujui NOF',
};
const ACTION_LABEL: Record<string, string> = { SUBMIT: 'submit', ACCEPT: 'accept', REVISE: 'revisi', REJECT: 'reject' };

const lastVersion = (r: NotamRequest) => r.versions[r.versions.length - 1];
const itemE = (generated: string) => generated.split('\n').find((l) => /^E\)/.test(l))?.replace(/^E\)\s*/, '') ?? generated.split('\n')[0];

function Login({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const { error, run } = useAsync();
  return (
    <div className="auth">
      <aside className="auth-art">
        <TowerScene />
        <div className="auth-shade" />
        <div className="auth-copy">
          <a className="auth-brand" href="#" onClick={(e) => { e.preventDefault(); onBack(); }}><Mark size={38} /><span>NOTAM <b>AI</b> Generator</span></a>
          <h2>Dari narasi bebas menjadi NOTAM siap ditinjau.</h2>
          <p>Susun, tinjau, dan setujui NOTAM dalam satu alur yang tercatat dari Originator hingga NOF.</p>
        </div>
      </aside>
      <div className="auth-form">
        <div className="auth-top"><Partners /></div>
        <form className="login" onSubmit={(e) => { e.preventDefault(); run(async () => { session.set((await api<{ token: string }>('POST', '/auth/login', { username, password })).token); onDone(); }); }}>
          <h1>Masuk</h1>
          <p className="sub">Gunakan akun yang diberikan administrator.</p>
          <label className="field">Username<input placeholder="Username" autoComplete="username" autoFocus value={username} onChange={(e) => setU(e.target.value)} /></label>
          <label className="field">Password<input placeholder="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setP(e.target.value)} /></label>
          <button>Masuk</button>
          {error && <p role="alert">{error}</p>}
          <a className="back" href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>Kembali ke beranda</a>
        </form>
      </div>
    </div>
  );
}

interface Prefill { airport: string; freeText: string; reuseOf?: string; n: number }

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const tgl = (plus: number) => { const d = new Date(Date.now() + plus * 86_400_000); return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`; };
// Contoh pesan dengan tanggal spesifik (mulai 3 hari lagi) agar langsung lolos aturan "bukan tanggal relatif".
const examples = () => [
  { label: 'Penutupan runway', airport: 'WIHH', text: `Landasan pacu 06/24 di Bandar Udara Halim Perdanakusuma ditutup karena pekerjaan mulai tanggal ${tgl(3)} pukul 08.00 WIB sampai tanggal ${tgl(4)} pukul 12.00 WIB` },
  { label: 'Taxiway tidak dapat digunakan', airport: 'WADD', text: `Taxiway A di Bandar Udara I Gusti Ngurah Rai tidak dapat digunakan karena pekerjaan pelapisan mulai tanggal ${tgl(3)} pukul 22.00 WITA sampai tanggal ${tgl(5)} pukul 05.00 WITA` },
  { label: 'PAPI tidak beroperasi', airport: 'WIHH', text: `PAPI runway 24 di Bandar Udara Halim Perdanakusuma tidak beroperasi mulai tanggal ${tgl(3)} pukul 00.00 UTC sampai tanggal ${tgl(4)} pukul 05.00 UTC` },
  { label: 'Apron ditutup', airport: 'WARR', text: `Apron di Bandar Udara Juanda ditutup karena pekerjaan mulai tanggal ${tgl(3)} pukul 08.00 WIB sampai tanggal ${tgl(3)} pukul 17.00 WIB` },
];

function Create({ prefill, onDone }: { prefill: Prefill; onDone: () => void }) {
  const [airport, setAirport] = useState(prefill.airport);
  const [freeText, setText] = useState(prefill.freeText);
  const [busy, setBusy] = useState(false);
  const [gate, setGate] = useState<{ open: boolean; reason: string; dailyLimit: number } | null>(null);
  const { error, run } = useAsync();
  useEffect(() => { api<{ open: boolean; reason: string; dailyLimit: number }>('GET', '/ops/gate').then(setGate).catch(() => undefined); }, []);
  const closed = gate?.open === false;
  const elapsed = useElapsed(busy);
  return (
    <section id="create">
      <h2>Buat NOTAM</h2>
      {closed && <p role="alert">Generate sedang tidak tersedia: {gate.reason}. Anda tetap dapat membuka dan meninjau pengajuan yang ada.</p>}
      {gate?.open && gate.dailyLimit > 0 && <p className="muted">Batas generate harian: {gate.dailyLimit} per pengguna.</p>}
      {prefill.reuseOf && (
        <div className="note">
          <p>Teks dipakai ulang dari permintaan sebelumnya.</p>
          <ul><li>Ubah teks (tanggal, lokasi, atau kondisi) sebelum Generate. Teks yang sama persis akan ditolak.</li></ul>
        </div>
      )}
      {!prefill.reuseOf && (
        <div className="examples">
          <span>Pilih contoh pesan</span>
          {examples().map((x) => <button key={x.label} type="button" className="chip" onClick={() => { setAirport(x.airport); setText(x.text); }}>{x.label}</button>)}
        </div>
      )}
      <div className="row">
        <input placeholder="Locator (mis. WIHH)" value={airport} maxLength={4} onChange={(e) => setAirport(e.target.value.toUpperCase())} />
        <textarea rows={4} placeholder="Tulis kondisi bandara dengan tanggal spesifik" value={freeText} onChange={(e) => setText(e.target.value)} />
        <button disabled={busy || closed} onClick={() => run(async () => {
          setBusy(true);
          try { await api('POST', '/requests', { airport, freeText, reuseOf: prefill.reuseOf }); setText(''); onDone(); } finally { setBusy(false); }
        })}>{busy ? `Memproses… ${fmtMs(elapsed)}` : 'Generate'}</button>
      </div>
      {busy && <p className="muted" role="status">Sistem sedang menyusun NOTAM dan memeriksa aturannya. Mohon tunggu, jangan tutup halaman ini.</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

function Detail({ id, onChange }: { id: string; onChange: () => void }) {
  const [r, setR] = useState<NotamRequest | null>(null);
  const [text, setText] = useState('');
  const [route, setRoute] = useState<'ATS' | 'PIA'>('ATS');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const { error, run } = useAsync();
  const ref = useRef<HTMLElement>(null);
  const elapsed = useElapsed(busy);
  const role = session.role;

  const load = useCallback(() => run(async () => {
    const d = await api<NotamRequest>('GET', `/requests/${id}`);
    setR(d);
    setText(d.versions[d.versions.length - 1].freeText);
  }), [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [id]);
  const done = () => { load(); onChange(); };
  // Aksi yang memanggil LLM/mengubah status dikunci selama berjalan agar tidak terkirim dua kali.
  const act = (fn: () => Promise<unknown>) => run(async () => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  });

  if (!r) return <p>{error || 'Memuat…'}</p>;
  const last = lastVersion(r);
  const editable = role === 'ORIGINATOR' && (r.status === 'DRAFT' || r.status === 'REVISION_REQUIRED');
  const reviewing = ({ UNDER_ATS: 'ATS', UNDER_PIA: 'PIA', UNDER_NOF: 'NOF' } as Record<string, string>)[r.status] === role;

  return (
    <section ref={ref}>
      <h2>{r.formNo} · {r.airport} <span className={`pill s-${r.status}`}>{STATUS_LABEL[r.status]}</span></h2>
      <p className="muted">Diusulkan {fmtDateTime(r.createdAt)} oleh <b>{r.originator}</b></p>
      <div className="row"><button className="ghost" onClick={() => run(() => download(`/requests/${id}/pdf`, `${r.formNo}.pdf`))}>Unduh PDF</button></div>
      <div className="compare">
        <div><h3>Pesan asli (v{last.no})</h3><p className="prompt">{last.freeText}</p></div>
        <div><h3>Draf NOTAM dari AI ({last.provider}{last.ms !== undefined ? ` · disusun dalam ${fmtMs(last.ms)}` : ''})</h3><pre>{last.generated}</pre></div>
      </div>
      {last.corrections?.length ? (
        <div className="note">
          <p>Dikoreksi otomatis oleh sistem:</p>
          <ul>{last.corrections.map((c) => <li key={c}>{c}</li>)}</ul>
        </div>
      ) : null}
      <p>Validasi: <strong className={`v-${last.validation?.status}`}>{last.validation?.status ?? '-'}</strong></p>
      <ul>{last.validation?.issues.map((i) => <li key={i.code}>[{i.level}] {i.message}</li>)}</ul>

      {editable && (
        <>
          <h3>Ubah teks input</h3>
          <div className="row"><textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} /></div>
          <div className="row">
            <button className="ghost" disabled={busy} onClick={() => act(async () => { await api('PUT', `/requests/${id}/text`, { freeText: text }); done(); })}>{busy ? `Memproses… ${fmtMs(elapsed)}` : 'Generate ulang'}</button>
            <select value={route} onChange={(e) => setRoute(e.target.value as 'ATS' | 'PIA')}>
              <option value="ATS">Kirim ke ATS</option>
              <option value="PIA">Langsung ke PIA</option>
            </select>
            <button disabled={busy || last.validation?.status === 'failed'} title={last.validation?.status === 'failed' ? 'Perbaiki error validasi lalu Generate ulang' : undefined} onClick={() => act(async () => {
              if (!confirm(`Submit ke ${route}? Pastikan jalur sudah benar.`)) return;
              await api('POST', `/requests/${id}/submit`, { route }); done();
            })}>Submit</button>
          </div>
        </>
      )}

      {reviewing && (
        <div className="row">
          <input style={{ flex: '1 1 260px' }} placeholder="Catatan (wajib untuk revisi/tolak)" value={note} onChange={(e) => setNote(e.target.value)} />
          {(['ACCEPT', 'REVISE', 'REJECT'] as const).map((a) => (
            <button key={a} disabled={busy} className={`btn-${a.toLowerCase()}`} onClick={() => act(async () => { await api('POST', `/requests/${id}/decision`, { action: a, note }); setNote(''); done(); })}>
              {{ ACCEPT: 'Accept', REVISE: 'Revisi', REJECT: 'Reject' }[a]}
            </button>
          ))}
        </div>
      )}
      {error && <p role="alert">{error}</p>}

      <h3>Riwayat</h3>
      <ul className="events">
        {r.events.map((e, i) => (
          <li key={i}>{fmtDateTime(e.at)} · {e.actor} ({e.role}) {ACTION_LABEL[e.action] ?? e.action}: {STATUS_LABEL[e.from]} → {STATUS_LABEL[e.to]}{e.note && ` — ${e.note}`}</li>
        ))}
      </ul>
    </section>
  );
}

function Dashboard({ tick, onStatus }: { tick: number; onStatus?: (s: string) => void }) {
  const [s, setS] = useState<Stats | null>(null);
  const { error, run } = useAsync();
  useEffect(() => { run(async () => setS(await api<Stats>('GET', '/requests/stats'))); }, [tick]);
  if (!s) return error ? <p role="alert">{error}</p> : null;

  const n = (k: string) => s.byStatus[k] ?? 0;
  const cards: { label: string; value: number; cls: string; status?: string }[] = [
    { label: 'Total', value: s.total, cls: '' },
    { label: 'Dalam review', value: n('UNDER_ATS') + n('UNDER_PIA') + n('UNDER_NOF'), cls: 'c-review' },
    { label: 'Perlu revisi', value: n('REVISION_REQUIRED'), cls: 'c-revise', status: 'REVISION_REQUIRED' },
    { label: 'Ditolak', value: n('REJECTED'), cls: 'c-reject', status: 'REJECTED' },
    { label: 'Disetujui NOF', value: n('APPROVED_BY_NOF'), cls: 'c-ok', status: 'APPROVED_BY_NOF' },
  ];
  if (session.role === 'ORIGINATOR') cards.splice(1, 0, { label: 'Draft', value: n('DRAFT'), cls: '', status: 'DRAFT' });
  const maxA = Math.max(1, ...s.byAirport.map((a) => a.n));
  const maxM = Math.max(1, ...s.byMonth.map((m) => m.n));

  return (
    <>
      <div className="cards">
        {cards.map((c) => (
          <button key={c.label} className={`card ${c.cls}`} disabled={!c.status || !onStatus} onClick={() => c.status && onStatus?.(c.status)}>
            <span className="num">{c.value}</span>
            <span className="lbl">{c.label}</span>
          </button>
        ))}
      </div>
      <div className="panels">
        <section>
          <h3>Bandara teratas</h3>
          {s.byAirport.length === 0 && <p className="muted">Belum ada data.</p>}
          {s.byAirport.map((a) => (
            <div className="bar" key={a.airport}><span className="mono">{a.airport}</span><i style={{ width: `${(a.n / maxA) * 100}%` }} /><b>{a.n}</b></div>
          ))}
        </section>
        <section>
          <h3>Pengajuan per bulan</h3>
          {s.byMonth.length === 0 && <p className="muted">Belum ada data.</p>}
          {s.byMonth.map((m) => (
            <div className="bar" key={m.month}><span className="mono">{m.month}</span><i style={{ width: `${(m.n / maxM) * 100}%` }} /><b>{m.n}</b></div>
          ))}
        </section>
      </div>
      {session.role === 'ADMIN' && (
        <section>
          <h3>Aktivitas terbaru</h3>
          {s.recent.length === 0 && <p className="muted">Belum ada aktivitas.</p>}
          <ul className="events">
            {s.recent.map((e, i) => (
              <li key={i}>{fmtDateTime(e.at)} · {e.actor} ({e.role}) {ACTION_LABEL[e.action] ?? e.action} <span className="mono">{e.formNo}</span> ({e.airport}) → {STATUS_LABEL[e.to]}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

const fmtUptime = (s: number) => (s >= 86400 ? `${Math.floor(s / 86400)} hari ` : '') + `${Math.floor((s % 86400) / 3600)} j ${Math.floor((s % 3600) / 60)} m`;
const Dot = ({ ok }: { ok: boolean | null }) => <i className={`dot ${ok === null ? 'na' : ok ? 'ok' : 'bad'}`} />;

function ServerPanel() {
  const [s, setS] = useState<OpsStatus | null>(null);
  const [form, setForm] = useState<GateState | null>(null);
  const [busy, setBusy] = useState('');
  const [saved, setSaved] = useState('');
  const { error, run } = useAsync();
  const load = useCallback(() => run(async () => {
    const d = await api<OpsStatus>('GET', '/ops/status');
    setS(d);
    setForm((f) => f ?? d.gate);
  }), []);
  useEffect(() => { load(); const t = setInterval(load, 10_000); return () => clearInterval(t); }, [load]);

  const act = (name: string, fn: () => Promise<unknown>) => run(async () => {
    setBusy(name); setSaved('');
    try { await fn(); await load(); setSaved('Tersimpan.'); } finally { setBusy(''); }
  });
  const saveGate = (g: GateState) => act('gate', async () => setForm(await api<GateState>('PUT', '/ops/gate', g)));

  if (!s || !form) return error ? <p role="alert">{error}</p> : <p>Memuat…</p>;
  const ollama = s.llm.provider === 'ollama';
  const memUsed = Math.round(((s.server.totalMemMB - s.server.freeMemMB) / s.server.totalMemMB) * 100);
  return (
    <>
      <div className="cards">
        <div className="card"><span className="lbl"><Dot ok={s.server.db} /> Database</span><span className="num sm">{s.server.db ? 'Terhubung' : 'Terputus'}</span></div>
        <div className="card"><span className="lbl"><Dot ok={s.llm.reachable} /> LLM ({s.llm.provider})</span><span className="num sm">{s.llm.reachable === null ? 'n/a' : s.llm.reachable ? `${s.llm.latencyMs} ms` : 'Tidak terjangkau'}</span></div>
        <div className="card"><span className="lbl"><Dot ok={s.gateStatus.open} /> Generate</span><span className="num sm">{s.gateStatus.open ? 'Dibuka' : 'Ditutup'}</span></div>
        <div className="card"><span className="lbl">Uptime</span><span className="num sm">{fmtUptime(s.server.uptimeSec)}</span></div>
        <div className="card"><span className="lbl">Memori PC</span><span className="num sm">{memUsed}%</span></div>
      </div>

      <section>
        <h2>Kontrol generate</h2>
        <p className="muted">Menjeda menghentikan pembuatan NOTAM baru dan membongkar model dari GPU (GPU siaga); membuka memuatnya kembali. Review, daftar, dan unduhan tetap berjalan.</p>
        <div className="row">
          {form.enabled
            ? <button className="btn-reject" disabled={busy === 'gate'} onClick={() => saveGate({ ...form, enabled: false })}>Jeda generate</button>
            : <button className="btn-accept" disabled={busy === 'gate'} onClick={() => saveGate({ ...form, enabled: true })}>Buka generate</button>}
          <span className={`pill ${form.enabled ? 's-APPROVED_BY_NOF' : 's-REJECTED'}`}>{form.enabled ? 'Aktif' : 'Dijeda'}</span>
        </div>
        <div className="row">
          <label className="field">Pesan untuk pengguna<input value={form.message} maxLength={200} placeholder="mis. GPU sedang maintenance" onChange={(e) => setForm({ ...form, message: e.target.value })} /></label>
          <label className="field">Jam layanan (kosong = 24 jam)<input value={form.window} placeholder="08:00-17:00" onChange={(e) => setForm({ ...form, window: e.target.value })} /></label>
          <label className="field">Batas generate per pengguna per hari (0 = tanpa batas)<input type="number" min={0} max={1000} value={form.dailyLimit} onChange={(e) => setForm({ ...form, dailyLimit: Number(e.target.value) })} /></label>
        </div>
        <div className="row">
          <button disabled={busy === 'gate'} onClick={() => saveGate(form)}>Simpan pengaturan</button>
          {saved && <span className="muted">{saved}</span>}
        </div>
        {error && <p role="alert">{error}</p>}
        {!s.gateStatus.open && <p className="muted">Status sekarang: {s.gateStatus.reason}</p>}
      </section>

      <div className="panels">
        <section>
          <h3>Model LLM</h3>
          <p className="muted">{s.llm.provider}{s.llm.model && ` · ${s.llm.model}`}</p>
          {ollama && (s.llm.loaded.length
            ? s.llm.loaded.map((m) => <p key={m.name}><Dot ok /> <b>{m.name}</b> dimuat · {m.sizeMB} MB{m.expires && ` · otomatis dibongkar ${fmtDateTime(m.expires)}`}</p>)
            : <p><Dot ok={null} /> Tidak ada model di memori (permintaan pertama akan lebih lambat).</p>)}
          {!ollama && <p className="muted">Tombol model hanya untuk LLM_PROVIDER=ollama.</p>}
          <div className="row">
            <button className="ghost" disabled={!ollama || !!busy} onClick={() => act('warm', () => api('POST', '/ops/llm/warmup'))}>{busy === 'warm' ? 'Memuat…' : 'Muat model (warm-up)'}</button>
            <button className="ghost" disabled={!ollama || !!busy} onClick={() => act('unload', () => api('POST', '/ops/llm/unload'))}>{busy === 'unload' ? 'Membongkar…' : 'Bongkar model'}</button>
          </div>
          <p className="muted">Warm-up sebelum acara; bongkar untuk membebaskan GPU/RAM saat tidak dipakai.</p>
        </section>
        <section>
          <h3>Pemakaian hari ini</h3>
          <p className="muted">Berjalan {s.usage.running}/{s.usage.maxConcurrent} · antre {s.usage.queued} · gagal sejak start {s.usage.failuresSinceStart}{s.usage.avgMs !== null && ` · rata-rata ${(s.usage.avgMs / 1000).toFixed(1)} dtk`}</p>
          {s.usage.today.length === 0 && <p className="muted">Belum ada generate hari ini.</p>}
          {s.usage.today.map((u) => <div className="bar" key={u.user}><span>{u.user}</span><i style={{ width: `${(u.n / Math.max(...s.usage.today.map((x) => x.n))) * 100}%` }} /><b>{u.n}</b></div>)}
        </section>
      </div>
      <p className="muted">PC: {s.server.host} · {s.server.cpus} CPU · memori bebas {s.server.freeMemMB} MB dari {s.server.totalMemMB} MB · aplikasi {s.server.appMemMB} MB. Diperbarui otomatis tiap 10 detik.</p>
    </>
  );
}

interface Filter { status: string; airport: string; q: string; from: string; to: string }
const EMPTY_FILTER: Filter = { status: '', airport: '', q: '', from: '', to: '' };

function ListView({ tick, filter, setFilter, onChange, onReuse }: {
  tick: number; filter: Filter; setFilter: (f: Filter) => void; onChange: () => void; onReuse: (r: NotamRequest) => void;
}) {
  const [list, setList] = useState<NotamRequest[]>([]);
  const [selected, setSelected] = useState('');
  const { error, run } = useAsync();
  const role = session.role;

  const refresh = useCallback(() => run(async () => {
    const params: Record<string, string> = { status: filter.status, airport: filter.airport, q: filter.q };
    if (filter.from) params.from = new Date(`${filter.from}T00:00:00`).toISOString();
    if (filter.to) params.to = new Date(`${filter.to}T23:59:59.999`).toISOString();
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    setList(await api<NotamRequest[]>('GET', '/requests' + (qs ? `?${qs}` : '')));
  }), [filter]);
  useEffect(() => { refresh(); }, [refresh, tick]);

  const reviewer = role !== 'ORIGINATOR';
  // MoM: NOF melihat PIA wilayah yang meneruskan pengajuan (bukan Originator) beserta tanggal diteruskan, tanpa kolom prompt.
  const nof = role === 'NOF';
  const forwarded = (r: NotamRequest) => [...r.events].reverse().find((e) => e.role === 'PIA' && e.action === 'ACCEPT');
  const cols = nof ? 7 : reviewer ? 8 : 7;
  return (
    <>
      <h2>{reviewer ? 'Daftar NOTAM' : 'Riwayat pengajuan'}</h2>
      <div className="toolbar">
        {reviewer && <button className="ghost" onClick={() => run(() => download('/requests/export.xlsx', 'notam.xlsx'))}>Unduh Excel</button>}
        <select aria-label="Status" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
          <option value="">Semua status</option>
          {Object.entries(STATUS_LABEL).filter(([k]) => reviewer ? k !== 'DRAFT' : true).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input aria-label="Bandara" placeholder="Bandara" maxLength={4} value={filter.airport} onChange={(e) => setFilter({ ...filter, airport: e.target.value.toUpperCase() })} />
        <label className="date">Dari <input type="date" value={filter.from} onChange={(e) => setFilter({ ...filter, from: e.target.value })} /></label>
        <label className="date">Sampai <input type="date" value={filter.to} onChange={(e) => setFilter({ ...filter, to: e.target.value })} /></label>
        <input aria-label="Cari" placeholder="Cari…" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
        <button className="ghost" onClick={() => setFilter(EMPTY_FILTER)}>Reset</button>
      </div>
      {error && <p role="alert">{error}</p>}
      <table className="list">
        <thead>
          {nof
            ? <tr><th>No</th><th>Nomor Request NOTAM</th><th>Tanggal Pengusulan (PIA)</th><th>NOTAM Generated</th><th>Pengusul (PIA)</th><th>Status</th><th>Aksi</th></tr>
            : <tr><th>No</th><th>Nomor Form</th><th>Tanggal Pengusulan</th><th>NOTAM Prompt</th>{reviewer && <th>NOTAM Generated</th>}<th>Pengusul</th><th>Status</th><th>Aksi</th></tr>}
        </thead>
        <tbody>
          {list.length === 0 && <tr><td colSpan={cols} className="muted empty">Tidak ada data.</td></tr>}
          {list.map((r, i) => (
            <tr key={r._id} onClick={() => setSelected(r._id)} className={r._id === selected ? 'sel' : ''}>
              <td data-label="No">{i + 1}</td>
              <td className="mono" data-label={nof ? 'Nomor request' : 'Nomor form'}>{r.formNo}</td>
              <td data-label="Tanggal">{nof ? (forwarded(r) ? fmtDate(forwarded(r)!.at) : '–') : fmtDate(r.createdAt)}</td>
              {!nof && <td className="clip" data-label="Pesan" title={lastVersion(r).freeText}>{lastVersion(r).freeText}</td>}
              {reviewer && <td className="clip mono" data-label="NOTAM" title={lastVersion(r).generated}>{itemE(lastVersion(r).generated)}</td>}
              <td data-label="Pengusul">{nof ? (forwarded(r)?.actor ?? '–') : r.originator}</td>
              <td data-label="Status"><span className={`pill s-${r.status}`}>{STATUS_LABEL[r.status]}</span></td>
              <td className="actions" onClick={(e) => e.stopPropagation()}>
                <button className="ghost sm" onClick={() => setSelected(r._id)}>Detail</button>
                {role === 'ORIGINATOR' && <button className="ghost sm" onClick={() => onReuse(r)}>Reuse</button>}
                <button className="ghost sm" onClick={() => run(() => download(`/requests/${r._id}/pdf`, `${r.formNo}.pdf`))}>PDF</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected && <Modal title="Detail NOTAM" wide onClose={() => setSelected('')}><Detail key={selected} id={selected} onChange={() => { refresh(); onChange(); }} /></Modal>}
    </>
  );
}

type Tab = 'ringkasan' | 'analytics' | 'jenis' | 'server' | 'pengguna' | 'audit' | 'daftar' | 'kamus';
type View = 'beranda' | 'analytics' | 'jenis' | 'kamus';
interface Group<K extends string> { title: string; items: [K, string][] }
const ADMIN_MENU: Group<Tab>[] = [
  { title: 'Pantau', items: [['ringkasan', 'Ringkasan'], ['analytics', 'Analytics'], ['jenis', 'Laporan Jenis'], ['daftar', 'Daftar NOTAM']] },
  { title: 'Kelola', items: [['server', 'Server'], ['pengguna', 'Pengguna'], ['audit', 'Audit Log']] },
  { title: 'Referensi', items: [['kamus', 'Kamus']] },
];
const REVIEWER_MENU: Group<View>[] = [{ title: 'Menu', items: [['beranda', 'Beranda'], ['analytics', 'Analytics'], ['jenis', 'Laporan Jenis'], ['kamus', 'Kamus']] }];
const ORIGINATOR_MENU: Group<View>[] = [{ title: 'Menu', items: [['beranda', 'Beranda'], ['kamus', 'Kamus']] }];

// Sidebar: kelompok menu di layar lebar, baris yang dapat digeser di layar kecil.
function Side<K extends string>({ groups, current, onPick }: { groups: Group<K>[]; current: K; onPick: (k: K) => void }) {
  return (
    <nav className="tabs side" aria-label="Menu utama">
      {groups.map((g) => (
        <div className="grp-wrap" key={g.title}>
          <span className="grp">{g.title}</span>
          {g.items.map(([k, label]) => <button key={k} className={current === k ? 'on' : ''} aria-current={current === k ? 'page' : undefined} onClick={() => onPick(k)}>{label}</button>)}
        </div>
      ))}
    </nav>
  );
}

const initials = (u: string) => {
  const name = u.split('@')[0];
  const parts = name.split(/[._-]/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
};

function App() {
  const [authed, setAuthed] = useState(!!session.role);
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState<Filter>(EMPTY_FILTER);
  const [prefill, setPrefill] = useState<Prefill>({ airport: '', freeText: '', n: 0 });
  const [tab, setTab] = useState<Tab>('ringkasan');
  const [view, setView] = useState<View>('beranda');
  const [route, setRoute] = useState<'beranda' | 'masuk'>(() => (location.hash === '#masuk' ? 'masuk' : 'beranda'));
  useEffect(() => {
    const f = () => setRoute(location.hash === '#masuk' ? 'masuk' : 'beranda');
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  const home = () => { history.replaceState(null, '', location.pathname); setRoute('beranda'); window.scrollTo(0, 0); };
  const logout = () => { session.set(''); home(); setAuthed(false); toast.info('Anda telah keluar', 'Sesi diakhiri. Sampai jumpa lagi.'); };
  const bump = () => setTick((t) => t + 1);

  if (!authed) {
    return route === 'masuk'
      ? <Login onDone={() => { history.replaceState(null, '', location.pathname); setAuthed(true); }} onBack={home} />
      : <Landing onLogin={() => { location.hash = '#masuk'; window.scrollTo(0, 0); }} />;
  }
  const role = session.role;
  const admin = role === 'ADMIN';
  const reviewer = role === 'ATS' || role === 'PIA' || role === 'NOF';
  const reuse = (r: NotamRequest) => {
    setPrefill({ airport: r.airport, freeText: lastVersion(r).freeText, reuseOf: r._id, n: Date.now() });
    setTimeout(() => document.getElementById('create')?.scrollIntoView({ behavior: 'smooth' }), 50);
  };
  const byStatus = (status: string) => { setFilter({ ...EMPTY_FILTER, status }); if (admin) setTab('daftar'); };
  const list = <ListView tick={tick} filter={filter} setFilter={setFilter} onChange={bump} onReuse={reuse} />;

  return (
    <>
      <header className="appbar">
        <span className="brand"><Mark size={32} /><span className="wm">NOTAM <b>AI</b> Generator</span></span>
        <Partners />
        <span className="who">
          <span className="avatar" aria-hidden="true">{initials(session.user)}</span>
          <span className="uid"><b>{session.user}</b><small>{role}</small></span>
          <button className="ghost" onClick={logout}>Keluar</button>
        </span>
      </header>
      <Ticker tick={tick} />
      <main className="with-side">
      {admin && <Side groups={ADMIN_MENU} current={tab} onPick={setTab} />}
      {reviewer && <Side groups={REVIEWER_MENU} current={view} onPick={setView} />}
      {role === 'ORIGINATOR' && <Side groups={ORIGINATOR_MENU} current={view} onPick={setView} />}
      <div className="content">
      {admin ? (
        <>
          {tab === 'ringkasan' && <Dashboard tick={tick} onStatus={byStatus} />}
          {tab === 'analytics' && <AnalyticsPanel />}
          {tab === 'jenis' && <TypesPanel />}
          {tab === 'server' && <ServerPanel />}
          {tab === 'pengguna' && <Users />}
          {tab === 'audit' && <AuditPanel />}
          {tab === 'daftar' && list}
          {tab === 'kamus' && <KamusPanel />}
        </>
      ) : (
        <>
          {view === 'kamus' ? <KamusPanel /> : reviewer && view === 'analytics' ? <AnalyticsPanel /> : reviewer && view === 'jenis' ? <TypesPanel /> : (
            <>
              <Dashboard tick={tick} onStatus={(s) => setFilter({ ...EMPTY_FILTER, status: s })} />
              {role === 'ORIGINATOR' && <Create key={prefill.n} prefill={prefill} onDone={bump} />}
              {list}
            </>
          )}
        </>
      )}
      </div>
      </main>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<><App /><Toaster /></>);
