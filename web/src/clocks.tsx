import { useEffect, useState } from 'react';

const ZONES = [
  { label: 'WIB', tz: 'Asia/Jakarta', note: 'UTC+7' },
  { label: 'WITA', tz: 'Asia/Makassar', note: 'UTC+8' },
  { label: 'WIT', tz: 'Asia/Jayapura', note: 'UTC+9' },
  { label: 'UTC', tz: 'UTC', note: 'UTC' },
];

function parts(now: Date, tz: string) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: 'short', year: 'numeric' });
  const m: Record<string, string> = {};
  for (const p of f.formatToParts(now)) m[p.type] = p.value;
  return { h: Number(m.hour) % 24, mi: Number(m.minute), s: Number(m.second), date: `${m.day} ${m.month} ${m.year}`, time: `${m.hour}:${m.minute}:${m.second}` };
}

function Face({ h, mi, s }: { h: number; mi: number; s: number }) {
  const hand = (deg: number, len: number, w: number, cls: string) => (
    <line className={cls} x1="50" y1="50" x2="50" y2={50 - len} strokeWidth={w} strokeLinecap="round" transform={`rotate(${deg} 50 50)`} />
  );
  return (
    <svg viewBox="0 0 100 100" className="clock-face" aria-hidden="true">
      <circle cx="50" cy="50" r="47" className="clock-rim" />
      {Array.from({ length: 12 }, (_, i) => (
        <line key={i} x1="50" y1="6" x2="50" y2={i % 3 === 0 ? 14 : 10} className="clock-tick" strokeWidth={i % 3 === 0 ? 2.2 : 1.2} transform={`rotate(${i * 30} 50 50)`} />
      ))}
      {hand((h % 12) * 30 + mi * 0.5, 24, 3.2, 'clock-h')}
      {hand(mi * 6 + s * 0.1, 35, 2.2, 'clock-m')}
      {hand(s * 6, 39, 1, 'clock-s')}
      <circle cx="50" cy="50" r="2.6" className="clock-pin" />
    </svg>
  );
}

export function Clocks() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <section className="clocks" aria-label="Jam zona waktu Indonesia dan UTC">
      {ZONES.map((z) => {
        const p = parts(now, z.tz);
        return (
          <div className="clock" key={z.label}>
            <Face h={p.h} mi={p.mi} s={p.s} />
            <b className="clock-name">{z.label}</b>
            <span className="clock-digital mono">{p.time}</span>
            <small className="clock-date">{p.date} · {z.note}</small>
          </div>
        );
      })}
    </section>
  );
}
