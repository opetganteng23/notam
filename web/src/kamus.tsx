import { useEffect, useMemo, useState } from 'react';
import { api, download } from './api';
import { useAsync } from './util';

interface Column { key: string; label: string; mono?: boolean; num?: boolean }
interface DTable { id: string; title: string; note?: string; columns: Column[]; rows: Record<string, string | number>[] }
interface Category { id: string; title: string; summary: string; source: string; tables: DTable[] }

const SIZES = [25, 50, 100];
const matches = (r: Record<string, string | number>, q: string) => !q || Object.values(r).some((v) => String(v).toLowerCase().includes(q));

function Table({ t, q }: { t: DTable; q: string }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(25);
  const [filters, setFilters] = useState<Record<string, string>>({});

  // Kolom dengan sedikit nilai berbeda (mis. FIR, zona) otomatis mendapat filter pilihan.
  const facets = useMemo(() => (t.rows.length < 30 ? [] : t.columns.filter((c) => !c.num).map((c) => ({ c, values: [...new Set(t.rows.map((r) => String(r[c.key])))] })).filter((f) => f.values.length >= 2 && f.values.length <= 8)), [t]);

  const rows = useMemo(() => {
    let list = t.rows.filter((r) => matches(r, q) && Object.entries(filters).every(([k, v]) => !v || String(r[k]) === v));
    if (sort) list = [...list].sort((a, b) => {
      const x = a[sort.key], y = b[sort.key];
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'id', { numeric: true })) * sort.dir;
    });
    return list;
  }, [t, q, filters, sort]);
  useEffect(() => setPage(0), [q, filters, size]);

  const pages = Math.max(1, Math.ceil(rows.length / size));
  const shown = rows.slice(page * size, (page + 1) * size);
  return (
    <section className="dict-table">
      <div className="dt-head">
        <h3>{t.title} <span className="muted">{rows.length === t.rows.length ? t.rows.length : `${rows.length} dari ${t.rows.length}`}</span></h3>
        <div className="dt-filters">
          {facets.map(({ c, values }) => (
            <select key={c.key} aria-label={`Filter ${c.label}`} value={filters[c.key] ?? ''} onChange={(e) => setFilters({ ...filters, [c.key]: e.target.value })}>
              <option value="">{c.label}: semua</option>
              {values.sort().map((v) => <option key={v}>{v}</option>)}
            </select>
          ))}
        </div>
      </div>
      {t.note && <p className="muted note-line">{t.note}</p>}
      <table className="dict">
        <thead>
          <tr>{t.columns.map((c) => (
            <th key={c.key} className="sortable" aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} onClick={() => setSort({ key: c.key, dir: sort?.key === c.key && sort.dir === 1 ? -1 : 1 })}>{c.label}</th>
          ))}</tr>
        </thead>
        <tbody>
          {shown.length === 0 && <tr><td colSpan={t.columns.length} className="muted empty">Tidak ada yang cocok.</td></tr>}
          {shown.map((r, i) => (
            <tr key={i}>{t.columns.map((c) => <td key={c.key} data-label={c.label} className={`${c.mono ? 'mono' : ''} ${c.num ? 'num' : ''}`}>{String(r[c.key] ?? '')}</td>)}</tr>
          ))}
        </tbody>
      </table>
      {rows.length > SIZES[0] && (
        <div className="pager">
          <span className="muted">{page * size + 1}–{Math.min(rows.length, (page + 1) * size)} dari {rows.length}</span>
          <span className="grow" />
          <label className="date">Baris <select value={size} onChange={(e) => setSize(Number(e.target.value))}>{SIZES.map((s) => <option key={s}>{s}</option>)}</select></label>
          <button className="ghost sm" disabled={page <= 0} onClick={() => setPage(page - 1)}>Sebelumnya</button>
          <span>Hal {page + 1}/{pages}</span>
          <button className="ghost sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Berikutnya</button>
        </div>
      )}
    </section>
  );
}

export function KamusPanel() {
  const [cats, setCats] = useState<Category[] | null>(null);
  const [active, setActive] = useState('bandara');
  const [q, setQ] = useState('');
  const { error, run } = useAsync();
  useEffect(() => { run(async () => setCats(await api<Category[]>('GET', '/dictionary'))); }, []);

  const term = q.trim().toLowerCase();
  const hits = useMemo(() => Object.fromEntries((cats ?? []).map((c) => [c.id, c.tables.reduce((a, t) => a + t.rows.filter((r) => matches(r, term)).length, 0)])), [cats, term]);
  const cat = cats?.find((c) => c.id === active);

  return (
    <>
      <div className="toolbar">
        <input aria-label="Cari di kamus" placeholder="Cari di kategori ini (mis. RWY, WIHH, ditutup)…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="grow" />
        <button className="ghost" onClick={() => run(() => download('/dictionary/export.xlsx', 'kamus-notam.xlsx'))}>Unduh Excel (semua kategori)</button>
      </div>
      {error && <p role="alert">{error}</p>}
      {!cats ? (!error && <p className="muted">Memuat…</p>) : (
        <>
          <div className="seg cats" role="tablist" aria-label="Kategori kamus">
            {cats.map((c) => (
              <button key={c.id} role="tab" aria-selected={active === c.id} className={active === c.id ? 'on' : ''} onClick={() => setActive(c.id)}>
                {c.title}{term && <em>{hits[c.id]}</em>}
              </button>
            ))}
          </div>
          {cat && (
            <>
              <section className="cat-head">
                <h2>{cat.title}</h2>
                <p>{cat.summary}</p>
                <p className="muted src">Sumber: {cat.source}.</p>
              </section>
              {cat.tables.map((t) => <Table key={`${cat.id}-${t.id}`} t={t} q={term} />)}
            </>
          )}
        </>
      )}
    </>
  );
}
