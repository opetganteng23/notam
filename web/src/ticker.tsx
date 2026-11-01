import { useEffect, useRef, useState } from 'react';
import { Stats, api } from './api';

const STATUS_LABEL: Record<string, string> = {
  UNDER_ATS: 'Review ATS', UNDER_PIA: 'Review PIA', UNDER_NOF: 'Review NOF',
  REVISION_REQUIRED: 'Perlu revisi', REJECTED: 'Ditolak', APPROVED_BY_NOF: 'Disetujui NOF',
};
const ACTION_LABEL: Record<string, string> = { SUBMIT: 'mengajukan', ACCEPT: 'menyetujui', REVISE: 'meminta revisi', REJECT: 'menolak', IMPORT: 'mengarsipkan' };
const hhmm = (s: string) => new Date(s).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

interface Item { key: string; text: string; fresh: boolean; tone?: string }

// Teks berjalan di bawah header: aktivitas terbaru dan antrean saat ini. Memeriksa server tiap 15 detik
// dan setelah setiap aksi (tick), sehingga kejadian baru langsung masuk dan diberi tanda BARU.
export function Ticker({ tick }: { tick: number }) {
  const [items, setItems] = useState<Item[]>([]);
  const [down, setDown] = useState(false);
  const [flash, setFlash] = useState(0);
  const seen = useRef<Set<string> | null>(null);
  const born = useRef(Date.now());

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const s = await api<Stats>('GET', '/requests/stats');
        if (!live) return;
        setDown(false);
        const first = seen.current === null;
        const known = seen.current ?? new Set<string>();
        let gotNew = false;
        const events: Item[] = s.recent.map((e) => {
          const key = `${e.formNo}|${e.at}|${e.action}`;
          const fresh = !first && !known.has(key) || (+new Date(e.at) > born.current && Date.now() - +new Date(e.at) < 10 * 60_000);
          if (!first && !known.has(key)) gotNew = true;
          known.add(key);
          const tone = e.to === 'APPROVED_BY_NOF' ? 'ok' : e.to === 'REJECTED' ? 'bad' : e.to === 'REVISION_REQUIRED' ? 'warn' : undefined;
          return { key, fresh, tone, text: `${hhmm(e.at)} · ${e.actor} (${e.role}) ${ACTION_LABEL[e.action] ?? e.action} ${e.formNo} · ${e.airport} → ${STATUS_LABEL[e.to] ?? e.to}` };
        });
        seen.current = known;
        if (gotNew) setFlash((n) => n + 1);
        const b = s.byStatus;
        const queue = `Antrean: ATS ${b.UNDER_ATS ?? 0} · PIA ${b.UNDER_PIA ?? 0} · NOF ${b.UNDER_NOF ?? 0} · revisi ${b.REVISION_REQUIRED ?? 0}`;
        setItems([{ key: 'queue', text: queue, fresh: false }, ...events, { key: 'total', text: `Total NOTAM tercatat: ${s.total} · disetujui NOF ${b.APPROVED_BY_NOF ?? 0}`, fresh: false }]);
      } catch {
        if (live) setDown(true);
      }
    };
    load();
    const t = setInterval(load, 15_000);
    return () => { live = false; clearInterval(t); };
  }, [tick]);

  const shown = down ? [{ key: 'down', text: 'Menunggu koneksi ke server…', fresh: false, tone: 'bad' }] : items.length ? items : [{ key: 'wait', text: 'Memuat aktivitas terbaru…', fresh: false }];
  const chars = shown.reduce((a, i) => a + i.text.length + 12, 0);
  const row = (suffix: string) => shown.map((i) => <span key={i.key + suffix} className={`tk ${i.tone ?? ''}`}>{i.fresh && <b className="new">BARU</b>}{i.text}</span>);
  return (
    <div className="ticker" role="status" aria-label="Aktivitas terbaru" key={flash}>
      <span className="live"><i />LIVE</span>
      <div className="track">
        <div className="run" style={{ ['--dur' as string]: `${Math.max(30, chars * 0.2)}s` }}>
          <div className="seq">{row('a')}</div>
          <div className="seq" aria-hidden="true">{row('b')}</div>
        </div>
      </div>
    </div>
  );
}
