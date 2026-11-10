import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { AuditItem, RegionRow, Role, UserRow, api, download, session } from './api';
import { fmtDate, fmtDateTime, useAsync } from './util';

const ROLES: Role[] = ['ORIGINATOR', 'ATS', 'PIA', 'NOF', 'ADMIN'];
const SIZES = [10, 25, 50];

function Pager({ page, size, total, onPage, onSize }: { page: number; size: number; total: number; onPage: (p: number) => void; onSize: (s: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  const from = total === 0 ? 0 : page * size + 1;
  return (
    <div className="pager">
      <span className="muted">{from}–{Math.min(total, (page + 1) * size)} dari {total}</span>
      <span className="grow" />
      <label className="date">Baris <select value={size} onChange={(e) => onSize(Number(e.target.value))}>{SIZES.map((s) => <option key={s}>{s}</option>)}</select></label>
      <button className="ghost sm" disabled={page <= 0} onClick={() => onPage(page - 1)}>Sebelumnya</button>
      <span>Hal {page + 1}/{pages}</span>
      <button className="ghost sm" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>Berikutnya</button>
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function UserDialog({ user, onClose, onSaved }: { user: UserRow | null; onClose: () => void; onSaved: () => void }) {
  const me = user?.username === session.user;
  const [form, setForm] = useState({ username: user?.username ?? '', name: user?.name ?? '', password: '', role: (user?.role ?? 'ORIGINATOR') as Role, active: user?.active ?? true, regions: user?.regions ?? [] as string[] });
  const [allRegions, setAllRegions] = useState<RegionRow[]>([]);
  useEffect(() => { api<RegionRow[]>('GET', '/regions').then(setAllRegions, () => undefined); }, []);
  const [busy, setBusy] = useState(false);
  const { error, run } = useAsync();

  const save = () => run(async () => {
    setBusy(true);
    try {
      if (!user) await api('POST', '/users', { username: form.username, name: form.name, password: form.password, role: form.role, regions: form.regions });
      else {
        const body: Record<string, unknown> = {};
        if (form.name.trim() !== (user.name ?? '')) body.name = form.name;
        if (form.role !== user.role) body.role = form.role;
        if (form.active !== user.active) body.active = form.active;
        if (form.password) body.password = form.password;
        if (JSON.stringify([...form.regions].sort()) !== JSON.stringify([...(user.regions ?? [])].sort())) body.regions = form.regions;
        if (Object.keys(body).length) await api('PATCH', `/users/${user._id}`, body);
      }
      onSaved();
      onClose();
    } finally { setBusy(false); }
  });

  return (
    <Modal title={user ? `Ubah akun ${user.username}` : 'Tambah pengguna'} onClose={onClose}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label className="field">Username
          <input autoFocus={!user} disabled={!!user} value={form.username} placeholder="huruf kecil, angka, atau email" onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </label>
        <label className="field">Nama lengkap
          <input value={form.name} maxLength={80} placeholder="opsional" onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="field">{user ? 'Password baru (kosongkan bila tidak diubah)' : 'Password (min. 8 karakter)'}
          <input autoFocus={!!user} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </label>
        <label className="field">Role
          <select disabled={me} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
        </label>
        {form.role !== 'ADMIN' && (
          <fieldset className="field">
            <legend>Wilayah (cabang)</legend>
            {allRegions.length === 0 ? <span className="muted">Belum ada wilayah. Buat dulu di menu Wilayah. Tanpa wilayah, pengguna tidak dibatasi.</span> : allRegions.map((r) => (
              <label className="check" key={r.code}><input type="checkbox" checked={form.regions.includes(r.code)} onChange={(e) => setForm({ ...form, regions: e.target.checked ? [...form.regions, r.code] : form.regions.filter((c) => c !== r.code) })} /> {r.name} <span className="mono muted">{r.code}</span></label>
            ))}
            <span className="muted">Pengguna hanya dapat membuat atau memproses NOTAM untuk bandara di wilayahnya. Kosong = tidak dibatasi.</span>
          </fieldset>
        )}
        {user && (
          <label className="check"><input type="checkbox" disabled={me} checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Akun aktif{me && ' (akun Anda sendiri tidak dapat dinonaktifkan)'}</label>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="row end">
          <button type="button" className="ghost" onClick={onClose}>Batal</button>
          <button disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </div>
      </form>
    </Modal>
  );
}

type SortKey = 'username' | 'role' | 'active' | 'lastLoginAt' | 'createdAt';
const COLS: [SortKey, string][] = [['username', 'Username'], ['role', 'Role'], ['active', 'Status'], ['lastLoginAt', 'Terakhir login'], ['createdAt', 'Dibuat']];

export function Users() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'username', dir: 1 });
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const [dialog, setDialog] = useState<UserRow | 'new' | null>(null);
  const { error, run } = useAsync();
  const load = useCallback(() => run(async () => setUsers(await api<UserRow[]>('GET', '/users'))), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => setPage(0), [q, role, status, size]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = users.filter((u) =>
      (!term || u.username.toLowerCase().includes(term) || (u.name ?? '').toLowerCase().includes(term) || u.role.toLowerCase().includes(term)) &&
      (!role || u.role === role) &&
      (!status || (status === 'aktif') === u.active));
    const val = (u: UserRow) => (sort.key === 'active' ? Number(u.active) : sort.key === 'lastLoginAt' || sort.key === 'createdAt' ? (u[sort.key] ? Date.parse(u[sort.key] as string) : null) : u[sort.key]);
    return list.sort((a, b) => {
      const x = val(a), y = val(b);
      if (x === y) return a.username.localeCompare(b.username);
      if (x === null) return 1; // yang belum pernah login selalu di bawah
      if (y === null) return -1;
      return (typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)) * sort.dir;
    });
  }, [users, q, role, status, sort]);

  const shown = rows.slice(page * size, (page + 1) * size);
  const active = users.filter((u) => u.active).length;
  const count = (r: Role) => users.filter((u) => u.role === r).length;
  const patch = (u: UserRow, body: object) => run(async () => { await api('PATCH', `/users/${u._id}`, body); await load(); });
  const remove = (u: UserRow) => run(async () => {
    if (!confirm(`Hapus akun "${u.username}" secara permanen? NOTAM yang pernah dibuatnya tetap tersimpan.`)) return;
    await api('DELETE', `/users/${u._id}`);
    await load();
  });

  return (
    <>
      <div className="toolbar">
        <input aria-label="Cari pengguna" placeholder="Cari nama, username, atau role…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Filter role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">Semua role</option>
          {ROLES.map((r) => <option key={r} value={r}>{r} ({count(r)})</option>)}
        </select>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Semua status</option>
          <option value="aktif">Aktif ({active})</option>
          <option value="nonaktif">Nonaktif ({users.length - active})</option>
        </select>
        <button className="ghost" onClick={() => { setQ(''); setRole(''); setStatus(''); }}>Reset</button>
        <span className="grow" />
        <button onClick={() => setDialog('new')}>Tambah pengguna</button>
      </div>
      {error && <p role="alert">{error}</p>}
      <table className="users">
        <thead>
          <tr>
            {COLS.map(([k, label]) => (
              <th key={k} className="sortable" aria-sort={sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} onClick={() => setSort({ key: k, dir: sort.key === k && sort.dir === 1 ? -1 : 1 })}>
                {label}
              </th>
            ))}
            <th>Wilayah</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 && <tr><td colSpan={7} className="muted empty">{users.length ? 'Tidak ada pengguna yang cocok.' : 'Memuat…'}</td></tr>}
          {shown.map((u) => {
            const me = u.username === session.user;
            return (
              <tr key={u._id}>
                <td data-label="Username">{u.name && <b className="uname">{u.name}</b>}<span className="mono">{u.username}</span>{me && <span className="muted"> (Anda)</span>}</td>
                <td data-label="Role"><span className="pill">{u.role}</span></td>
                <td data-label="Status"><span className={`pill ${u.active ? 's-APPROVED_BY_NOF' : 's-REJECTED'}`}>{u.active ? 'Aktif' : 'Nonaktif'}</span></td>
                <td data-label="Terakhir login">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : <span className="muted">Belum pernah</span>}</td>
                <td data-label="Dibuat">{fmtDate(u.createdAt)}</td>
                <td data-label="Wilayah">{u.role === 'ADMIN' ? <span className="muted">Semua</span> : u.regions?.length ? u.regions.map((c) => <span key={c} className="pill">{c}</span>) : <span className="muted">Tidak dibatasi</span>}</td>
                <td className="actions">
                  <button className="ghost sm" onClick={() => setDialog(u)}>Ubah</button>
                  {!me && <button className="ghost sm" onClick={() => patch(u, { active: !u.active })}>{u.active ? 'Nonaktifkan' : 'Aktifkan'}</button>}
                  {!me && !u.active && <button className="btn-reject sm" onClick={() => remove(u)}>Hapus</button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Pager page={page} size={size} total={rows.length} onPage={setPage} onSize={setSize} />
      <p className="muted">Akun hanya dapat dihapus setelah dinonaktifkan. Semua perubahan tercatat di tab Audit Log.</p>
      {dialog && <UserDialog user={dialog === 'new' ? null : dialog} onClose={() => setDialog(null)} onSaved={load} />}
    </>
  );
}

const ACTION: Record<string, [string, string]> = {
  LOGIN_OK: ['Login', 'ok'], LOGIN_FAIL: ['Login gagal', 'bad'], LOGIN_LOCKED: ['Login terkunci', 'bad'], LOGIN_BLOCKED: ['Login diblokir', 'bad'],
  REGION_CREATE: ['Buat wilayah', 'info'], REGION_UPDATE: ['Ubah wilayah', 'warn'], REGION_DELETE: ['Hapus wilayah', 'bad'], REQUEST_EDIT: ['Sunting Q/E', 'warn'],
  USER_CREATE: ['Buat akun', 'info'], USER_UPDATE: ['Ubah akun', 'warn'], USER_DELETE: ['Hapus akun', 'bad'],
  SERVER_GATE: ['Atur generate', 'warn'], SERVER_LLM_WARMUP: ['Muat model', 'info'], SERVER_LLM_UNLOAD: ['Bongkar model', 'info'],
  REQUEST_CREATE: ['Buat NOTAM', 'info'], REQUEST_TEXT: ['Ubah teks', 'info'], REQUEST_SUBMIT: ['Submit', 'info'],
  REQUEST_ACCEPT: ['Accept', 'ok'], REQUEST_REVISE: ['Revisi', 'warn'], REQUEST_REJECT: ['Reject', 'bad'],
};
const CATEGORIES: [string, string][] = [['LOGIN', 'Login'], ['USER', 'Pengguna'], ['SERVER', 'Server'], ['REQUEST', 'NOTAM']];
const EMPTY = { q: '', category: '', actor: '', from: '', to: '' };

export function AuditPanel() {
  const [f, setF] = useState(EMPTY);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(25);
  const [data, setData] = useState<{ items: AuditItem[]; total: number }>({ items: [], total: 0 });
  const [loaded, setLoaded] = useState(false);
  const { error, run } = useAsync();

  const qs = useCallback((paged: boolean) => {
    const p: Record<string, string> = { q: f.q, category: f.category, actor: f.actor };
    if (f.from) p.from = new Date(`${f.from}T00:00:00`).toISOString();
    if (f.to) p.to = new Date(`${f.to}T23:59:59.999`).toISOString();
    if (paged) { p.limit = String(size); p.skip = String(page * size); }
    return new URLSearchParams(Object.entries(p).filter(([, v]) => v)).toString();
  }, [f, page, size]);

  const load = useCallback(() => run(async () => {
    setData(await api<{ items: AuditItem[]; total: number }>('GET', `/audit?${qs(true)}`));
    setLoaded(true);
  }), [qs]);
  // Jeda singkat agar mengetik di kolom cari tidak memicu satu permintaan per huruf.
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => setPage(0), [f, size]);

  return (
    <>
      <div className="toolbar">
        <input aria-label="Cari" placeholder="Cari pelaku, target, keterangan…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <select aria-label="Kategori" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
          <option value="">Semua kategori</option>
          {CATEGORIES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input aria-label="Pelaku" placeholder="Pelaku (awalan)" value={f.actor} onChange={(e) => setF({ ...f, actor: e.target.value })} />
        <label className="date">Dari <input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
        <label className="date">Sampai <input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
        <button className="ghost" onClick={() => setF(EMPTY)}>Reset</button>
        <span className="grow" />
        <button className="ghost" onClick={load}>Muat ulang</button>
        <button className="ghost" onClick={() => run(() => download(`/audit/export.csv?${qs(false)}`, 'audit-log.csv'))}>Unduh CSV</button>
      </div>
      {error && <p role="alert">{error}</p>}
      <table className="audit">
        <thead><tr><th>Waktu</th><th>Pelaku</th><th>Aksi</th><th>Target</th><th>Keterangan</th><th>IP</th></tr></thead>
        <tbody>
          {data.items.length === 0 && <tr><td colSpan={6} className="muted empty">{loaded ? 'Tidak ada catatan yang cocok.' : 'Memuat…'}</td></tr>}
          {data.items.map((e) => {
            const [label, tone] = ACTION[e.action] ?? [e.action, 'info'];
            return (
              <tr key={e._id}>
                <td className="nowrap" data-label="Waktu">{new Date(e.at).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                <td data-label="Pelaku">{e.actor}{e.role && <span className="muted"> · {e.role}</span>}</td>
                <td data-label="Aksi"><span className={`pill a-${tone}`}>{label}</span></td>
                <td className="mono" data-label="Target">{e.target ?? ''}</td>
                <td data-label="Keterangan">{e.summary}</td>
                <td className="mono muted" data-label="IP">{e.ip ?? ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Pager page={page} size={size} total={data.total} onPage={setPage} onSize={setSize} />
      <p className="muted">Catatan hanya bisa ditambah, tidak dapat diubah atau dihapus lewat aplikasi. Password tidak pernah dicatat. Waktu dalam zona browser; CSV dalam UTC.</p>
    </>
  );
}

// Kelola wilayah (cabang): kumpulan bandara. Satu bandara hanya di satu wilayah.
function RegionDialog({ region, onClose, onSaved }: { region: RegionRow | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ code: region?.code ?? '', name: region?.name ?? '', airports: (region?.airports ?? []).join(', ') });
  const [busy, setBusy] = useState(false);
  const { error, run } = useAsync();
  const save = () => run(async () => {
    setBusy(true);
    try {
      const airports = form.airports.split(/[\s,;]+/).map((a) => a.trim().toUpperCase()).filter(Boolean);
      if (!region) await api('POST', '/regions', { code: form.code, name: form.name, airports });
      else await api('PATCH', `/regions/${region.code}`, { name: form.name, airports });
      onSaved();
      onClose();
    } finally { setBusy(false); }
  });
  return (
    <Modal title={region ? `Ubah wilayah ${region.code}` : 'Tambah wilayah'} onClose={onClose}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label className="field">Kode
          <input autoFocus={!region} disabled={!!region} value={form.code} maxLength={20} placeholder="mis. JKT" onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
        </label>
        <label className="field">Nama wilayah / cabang
          <input value={form.name} maxLength={80} placeholder="mis. Cabang Jakarta" onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="field">Bandara (locator ICAO, pisahkan dengan koma atau spasi)
          <textarea rows={4} className="mono" value={form.airports} placeholder="WIHH, WIII, WIAA" onChange={(e) => setForm({ ...form, airports: e.target.value })} />
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="row end">
          <button type="button" className="ghost" onClick={onClose}>Batal</button>
          <button disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function Regions() {
  const [list, setList] = useState<RegionRow[] | null>(null);
  const [dialog, setDialog] = useState<RegionRow | 'new' | null>(null);
  const { error, run } = useAsync();
  const load = useCallback(() => run(async () => setList(await api<RegionRow[]>('GET', '/regions'))), []);
  useEffect(() => { load(); }, [load]);
  const remove = (r: RegionRow) => run(async () => {
    if (!confirm(`Hapus wilayah "${r.name}"? Wilayah ini dilepas dari ${r.users} pengguna; pengguna tanpa wilayah tidak dibatasi.`)) return;
    await api('DELETE', `/regions/${r.code}`);
    await load();
  });
  return (
    <>
      <h2>Wilayah (cabang)</h2>
      <p className="muted">NOTAM hanya dapat dibuat dan diproses oleh pengguna di wilayah bandaranya (termasuk NOF per wilayah). Pengguna tanpa wilayah tidak dibatasi, dan semua role tetap dapat melihat peta dan analytics nasional.</p>
      <div className="toolbar"><span className="grow" /><button onClick={() => setDialog('new')}>Tambah wilayah</button></div>
      {error && <p role="alert">{error}</p>}
      <table className="users">
        <thead><tr><th>Kode</th><th>Nama</th><th>Bandara</th><th>Pengguna</th><th>Aksi</th></tr></thead>
        <tbody>
          {list && list.length === 0 && <tr><td colSpan={5} className="muted empty">Belum ada wilayah.</td></tr>}
          {!list && <tr><td colSpan={5} className="muted empty">Memuat…</td></tr>}
          {list?.map((r) => (
            <tr key={r.code}>
              <td data-label="Kode"><span className="mono">{r.code}</span></td>
              <td data-label="Nama"><b>{r.name}</b></td>
              <td data-label="Bandara" className="mono">{r.airports.length ? r.airports.join(', ') : <span className="muted">Belum ada</span>} <span className="muted">({r.airports.length})</span></td>
              <td data-label="Pengguna">{r.users}</td>
              <td className="actions">
                <button className="ghost sm" onClick={() => setDialog(r)}>Ubah</button>
                <button className="btn-reject sm" onClick={() => remove(r)}>Hapus</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Satu bandara hanya boleh ada di satu wilayah. Semua perubahan tercatat di tab Audit Log.</p>
      {dialog && <RegionDialog region={dialog === 'new' ? null : dialog} onClose={() => setDialog(null)} onSaved={load} />}
    </>
  );
}
