import { useEffect, useState } from 'react';
import { Me, api, session } from './api';
import { toast } from './toast';
import { fmtDateTime, useAsync } from './util';

// Profil milik sendiri: nama, email/username, dan password. Email dan password wajib dikonfirmasi dengan password saat ini.
export function ProfilePanel({ onChange }: { onChange: (me: Me) => void }) {
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState({ username: '', current: '' });
  const [pw, setPw] = useState({ current: '', next: '', again: '' });
  const [busy, setBusy] = useState('');
  const load = useAsync();
  const a = useAsync(), b = useAsync(), c = useAsync();

  useEffect(() => { load.run(async () => { const m = await api<Me>('GET', '/me'); setMe(m); setName(m.name); setEmail({ username: m.username, current: '' }); }); }, []);
  const wrap = (key: string, fn: () => Promise<void>) => async () => { setBusy(key); try { await fn(); } finally { setBusy(''); } };

  const saveName = wrap('name', () => a.run(async () => {
    const m = await api<Me>('PATCH', '/me', { name });
    setMe(m); onChange(m);
    toast.success('Profil disimpan', m.name ? `Nama tampil: ${m.name}.` : 'Nama dikosongkan; yang tampil adalah email/username.');
  }));
  const saveEmail = wrap('email', () => b.run(async () => {
    const r = await api<Me & { token: string }>('POST', '/me/username', email);
    session.set(r.token);
    setMe(r); onChange(r); setEmail({ username: r.username, current: '' });
    toast.success('Email/username diganti', `Gunakan ${r.username} saat login berikutnya. NOTAM milik Anda ikut dipindahkan.`);
  }));
  const savePw = wrap('pw', () => c.run(async () => {
    if (pw.next !== pw.again) throw new Error('Konfirmasi password baru tidak sama');
    await api('POST', '/me/password', { current: pw.current, next: pw.next });
    setPw({ current: '', next: '', again: '' });
    toast.success('Password diganti', 'Gunakan password baru saat login berikutnya.');
  }));

  if (!me) return load.error ? <p role="alert">{load.error}</p> : <p className="muted">Memuat…</p>;
  return (
    <div className="profile">
      <section className="profile-head">
        <span className="avatar lg" aria-hidden="true">{initialsOf(me.name || me.username)}</span>
        <div>
          <h2>{me.name || me.username}</h2>
          <p className="muted">{me.username} · <span className="pill">{me.role}</span></p>
          <p className="muted small">Akun dibuat {me.createdAt ? fmtDateTime(me.createdAt) : '–'} · terakhir login {me.lastLoginAt ? fmtDateTime(me.lastLoginAt) : '–'}</p>
        </div>
      </section>

      <div className="profile-grid">
        <section>
          <h3>Data diri</h3>
          <form className="form" onSubmit={(e) => { e.preventDefault(); saveName(); }}>
            <label className="field">Nama lengkap
              <input value={name} maxLength={80} placeholder="mis. Rizky Fadhillah" onChange={(e) => setName(e.target.value)} />
            </label>
            <p className="muted small">Nama tampil di header dan daftar pengguna. Kosongkan untuk memakai email/username.</p>
            {a.error && <p role="alert">{a.error}</p>}
            <div className="row end"><button disabled={busy === 'name' || name.trim() === me.name}>{busy === 'name' ? 'Menyimpan…' : 'Simpan nama'}</button></div>
          </form>
        </section>

        <section>
          <h3>Email / username</h3>
          <form className="form" onSubmit={(e) => { e.preventDefault(); saveEmail(); }}>
            <label className="field">Email atau username baru
              <input value={email.username} autoComplete="username" onChange={(e) => setEmail({ ...email, username: e.target.value.trim().toLowerCase() })} />
            </label>
            <label className="field">Password saat ini
              <input type="password" autoComplete="current-password" value={email.current} onChange={(e) => setEmail({ ...email, current: e.target.value })} />
            </label>
            <p className="muted small">Dipakai untuk login. NOTAM milik Anda ikut dipindahkan ke email baru; riwayat lama tetap mencatat email lama.</p>
            {b.error && <p role="alert">{b.error}</p>}
            <div className="row end"><button disabled={busy === 'email' || !email.current || email.username === me.username}>{busy === 'email' ? 'Menyimpan…' : 'Ganti email'}</button></div>
          </form>
        </section>

        <section>
          <h3>Ganti password</h3>
          <form className="form" onSubmit={(e) => { e.preventDefault(); savePw(); }}>
            <label className="field">Password saat ini
              <input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            </label>
            <label className="field">Password baru (min. 8 karakter)
              <input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            </label>
            <label className="field">Ulangi password baru
              <input type="password" autoComplete="new-password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} />
            </label>
            {c.error && <p role="alert">{c.error}</p>}
            <div className="row end"><button disabled={busy === 'pw' || !pw.current || pw.next.length < 8 || !pw.again}>{busy === 'pw' ? 'Menyimpan…' : 'Ganti password'}</button></div>
          </form>
          <p className="muted small">Lupa password saat ini? Minta admin menyetel ulang lewat menu Pengguna.</p>
        </section>
      </div>
    </div>
  );
}

export const initialsOf = (u: string) => {
  const base = u.includes('@') ? u.split('@')[0] : u;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : base.slice(0, 2)).toUpperCase();
};
