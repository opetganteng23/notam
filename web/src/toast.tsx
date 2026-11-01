import { useEffect, useState } from 'react';

type Kind = 'success' | 'error' | 'info';
interface Item { id: number; kind: Kind; title: string; text?: string; ms: number }

let items: Item[] = [];
let seq = 0;
const subs = new Set<() => void>();
const recent = new Map<string, number>();
const emit = () => subs.forEach((f) => f());
const remove = (id: number) => { items = items.filter((i) => i.id !== id); emit(); };

function push(kind: Kind, title: string, text?: string) {
  // Galat yang sama beruntun (mis. server mati saat polling) tidak ditumpuk.
  const key = `${kind}|${title}|${text}`;
  const now = Date.now();
  if (kind === 'error' && now - (recent.get(key) ?? 0) < 6000) return;
  recent.set(key, now);
  items = [...items.slice(-3), { id: ++seq, kind, title, text, ms: kind === 'error' ? 8000 : 4500 }];
  emit();
}

export const toast = {
  success: (title: string, text?: string) => push('success', title, text),
  error: (title: string, text?: string) => push('error', title, text),
  info: (title: string, text?: string) => push('info', title, text),
};

// Pemberitahuan yang harus bertahan melewati muat ulang halaman (mis. sesi berakhir).
export function flash(kind: Kind, title: string, text?: string) {
  try { sessionStorage.setItem('flash', JSON.stringify({ kind, title, text })); } catch { /* penyimpanan dinonaktifkan */ }
}

function Toast({ item }: { item: Item }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => remove(item.id), item.ms);
    return () => clearTimeout(t);
  }, [paused, item.id, item.ms]);
  return (
    <div className={`toast ${item.kind}`} role="status" style={{ '--ms': `${item.ms}ms` } as React.CSSProperties}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <b>{item.title}</b>
      <button className="tclose" aria-label="Tutup pemberitahuan" onClick={() => remove(item.id)} />
      {item.text && <span>{item.text}</span>}
      {!paused && <i className="tbar" />}
    </div>
  );
}

export function Toaster() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    subs.add(f);
    try {
      const raw = sessionStorage.getItem('flash');
      if (raw) {
        sessionStorage.removeItem('flash');
        const o = JSON.parse(raw);
        push(o.kind, o.title, o.text);
      }
    } catch { /* abaikan */ }
    return () => { subs.delete(f); };
  }, []);
  return <div className="toasts" aria-live="polite">{items.map((i) => <Toast key={i.id} item={i} />)}</div>;
}
