import { useEffect, useState } from 'react';

export const fmtDate = (s?: string) => !s || Number.isNaN(Date.parse(s)) ? '-' : new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
export const fmtDateTime = (s: string) => new Date(s).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function useAsync() {
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    try { await fn(); } catch (e) { setError((e as Error).message); }
  };
  return { error, run, setError };
}

const dec = (n: number) => n.toFixed(1).replace('.', ',');
export const fmtDuration = (h: number | null) => (h === null ? '–' : h < 1 ? `${Math.max(1, Math.round(h * 60))} mnt` : h < 48 ? `${dec(h)} jam` : `${dec(h / 24)} hari`);
export const fmtPct = (r: number | null) => (r === null ? '–' : `${Math.round(r * 100)}%`);

// Lama dalam milidetik menjadi teks: "18,2 dtk" atau "1 mnt 12 dtk".
export const fmtMs = (ms?: number) => {
  if (typeof ms !== 'number') return '';
  const s = ms / 1000;
  return s >= 60 ? `${Math.floor(s / 60)} mnt ${Math.round(s % 60)} dtk` : `${s.toFixed(1).replace('.', ',')} dtk`;
};

// Pewaktu hidup: milidetik sejak `active` menjadi true; kembali ke 0 saat selesai.
export function useElapsed(active: boolean) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!active) { setT(0); return; }
    const t0 = Date.now();
    const id = setInterval(() => setT(Date.now() - t0), 100);
    return () => clearInterval(id);
  }, [active]);
  return t;
}
