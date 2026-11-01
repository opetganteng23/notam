import { CSSProperties, useEffect, useState } from 'react';
import './scene.css';

export function useReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const m = matchMedia(query);
    const f = () => setReduced(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return reduced;
}

// Logo aplikasi: lambang AirNav putih di atas lencana navy (terbaca di latar terang maupun gelap).
export function Mark({ size = 32 }: { size?: number }) {
  return (
    <span className="mark" style={{ width: size, height: size }} role="img" aria-label="AirNav">
      <img src="/logos/airnav-white.png" alt="" width={160} height={160} />
    </span>
  );
}

// Deterministik agar adegan sama di setiap render.
const lcg = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const STARS = (() => {
  const r = lcg(11);
  return Array.from({ length: 52 }, () => ({ x: r() * 1440, y: r() * 330, r: 0.5 + r() * 1.2, d: r() * 4 }));
})();
const CLOUDS = [
  { y: 150, s: 1.3, t: 150, d: -20, o: 0.16 },
  { y: 232, s: 0.9, t: 110, d: -70, o: 0.2 },
  { y: 318, s: 1.7, t: 190, d: -120, o: 0.13 },
  { y: 400, s: 1.1, t: 130, d: -40, o: 0.22 },
  { y: 90, s: 0.8, t: 100, d: -90, o: 0.12 },
];
const RWY_N = 16;
const rwyPoints = Array.from({ length: RWY_N }, (_, i) => {
  const t = Math.pow((i + 1) / RWY_N, 1.9);
  return { t, y: 522 + 238 * t, xl: 853 - 273 * t, xr: 867 + 273 * t, r: 1.1 + 3.4 * t, d: -(t * 1.4) };
});
const DASHES = Array.from({ length: 9 }, (_, i) => {
  const t = Math.pow((i + 0.5) / 9, 1.9);
  return { y: 522 + 238 * t, h: 1 + 15 * t, w: 0.8 + 5.5 * t };
});

function Plane() {
  return (
    <g>
      <path d="M-46 0 C-46 -6 -34 -9 -14 -9 L30 -9 C42 -9 54 -4 58 0 C54 4 42 7 30 7 L-14 7 C-34 7 -46 5 -46 0Z" fill="#f4f8ff" />
      <path d="M-42 -2 L-58 -24 L-46 -24 L-24 -6 Z" fill="#d6e5fa" />
      <path d="M-4 -8 L-24 -22 L-13 -22 L14 -8 Z" fill="#e8f0fc" opacity=".92" />
      <path d="M-4 4 L-28 25 L-13 25 L18 4 Z" fill="#c4d9f4" />
      <rect x="0" y="9" width="17" height="6" rx="3" fill="#aac0e0" />
      <g fill="#6f99cf">{[-30, -20, -10, 0, 10, 20, 30].map((x) => <circle key={x} cx={x} cy={-3} r="1.5" />)}</g>
      <circle cx="-28" cy="25" r="1.8" fill="#ff4d4d" className="sc-blink" />
      <circle cx="-58" cy="-24" r="1.8" fill="#fff" className="sc-blink" style={{ animationDelay: '.7s' } as CSSProperties} />
    </g>
  );
}

// Adegan menara ATC saat senja: bintang berkedip, awan melintas, pesawat dan kontrail, lampu landasan berurutan,
// parabola radar berputar, beacon, dan cincin radar yang memancar dari menara. Dekoratif (aria-hidden).
export function TowerScene() {
  const reduced = useReducedMotion();
  return (
    <svg className="scene" viewBox="0 0 1440 760" preserveAspectRatio="xMaxYMax slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="sc-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#06142a" />
          <stop offset=".3" stopColor="#0b2850" />
          <stop offset=".55" stopColor="#16509c" />
          <stop offset=".63" stopColor="#4a86c8" />
          <stop offset=".69" stopColor="#f0a463" />
          <stop offset="1" stopColor="#f6c27a" />
        </linearGradient>
        <radialGradient id="sc-sun" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#ffd9a0" stopOpacity=".85" />
          <stop offset=".35" stopColor="#ffb870" stopOpacity=".4" />
          <stop offset="1" stopColor="#ffb870" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sc-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0c2038" />
          <stop offset="1" stopColor="#050d18" />
        </linearGradient>
        <linearGradient id="sc-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe3a0" />
          <stop offset="1" stopColor="#f0a84e" />
        </linearGradient>
        <linearGradient id="sc-trail" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#fff" stopOpacity=".6" />
        </linearGradient>
        <filter id="sc-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" /></filter>
      </defs>

      <rect width="1440" height="760" fill="url(#sc-sky)" />
      {STARS.map((s, i) => <circle key={i} className="sc-star" cx={s.x} cy={s.y} r={s.r} fill="#fff" style={{ '--d': `${s.d}s` } as CSSProperties} />)}
      <circle cx="700" cy="520" r="430" fill="url(#sc-sun)" />
      <circle cx="700" cy="548" r="64" fill="#ffd9a0" opacity=".92" />

      {CLOUDS.map((c, i) => (
        <g key={i} transform={`translate(0 ${c.y}) scale(${c.s})`} fill="#fff" opacity={c.o}>
          <g className="sc-cloud" style={{ '--t': `${c.t}s`, '--d': `${c.d}s` } as CSSProperties}>
            <ellipse cx="0" cy="0" rx="86" ry="15" /><ellipse cx="-42" cy="-9" rx="40" ry="14" /><ellipse cx="30" cy="-12" rx="48" ry="16" />
          </g>
        </g>
      ))}

      <path d="M0 520 L0 478 C120 455 200 490 320 470 S520 440 640 470 S880 485 1000 462 S1240 440 1440 470 L1440 520 Z" fill="#0a2547" opacity=".92" />
      <path d="M0 520 L0 500 C160 486 260 508 420 496 S700 482 860 498 S1160 486 1440 500 L1440 520 Z" fill="#071a33" />
      <rect y="518" width="1440" height="242" fill="url(#sc-ground)" />

      {/* landasan dalam perspektif */}
      <polygon points="853,522 867,522 1140,760 580,760" fill="#0e1c30" />
      <polygon points="853,522 867,522 1140,760 580,760" fill="none" stroke="#22406a" strokeWidth="1" opacity=".7" />
      {DASHES.map((d, i) => <rect key={i} x={860 - d.w / 2} y={d.y} width={d.w} height={d.h} fill="#e9eef8" opacity=".8" />)}
      {rwyPoints.map((p, i) => (
        <g key={i}>
          <circle className="sc-rwy" cx={p.xl} cy={p.y} r={p.r} fill="#ffe3a8" style={{ '--d': `${p.d}s` } as CSSProperties} />
          <circle className="sc-rwy" cx={p.xr} cy={p.y} r={p.r} fill="#ffe3a8" style={{ '--d': `${p.d}s` } as CSSProperties} />
        </g>
      ))}

      {/* menara ATC */}
      <g>
        <rect x="1096" y="540" width="128" height="22" rx="2" fill="#0a1828" />
        {[1110, 1134, 1158, 1182, 1204].map((x) => <rect key={x} x={x} y="547" width="9" height="5" fill="#ffd27a" opacity=".55" className="sc-flicker" style={{ '--d': `${(x % 7) * 0.4}s` } as CSSProperties} />)}
        <polygon points="1148,560 1172,560 1167,334 1153,334" fill="#0d1e36" />
        <polygon points="1148,560 1172,560 1167,334 1153,334" fill="none" stroke="#223a5e" strokeWidth="1" />
        {[372, 414, 456, 498].map((y) => <rect key={y} x="1156" y={y} width="8" height="6" fill="#ffd27a" opacity=".5" className="sc-flicker" style={{ '--d': `${y % 5}s` } as CSSProperties} />)}
        <path d="M1130 338 L1190 338 L1208 292 L1112 292 Z" fill="#0d1e36" stroke="#223a5e" />
        <polygon points="1121,318 1199,318 1204,298 1116,298" fill="url(#sc-glass)" />
        <polygon points="1121,318 1199,318 1204,298 1116,298" fill="#ffb54d" opacity=".5" filter="url(#sc-glow)" />
        {[0, 1, 2, 3, 4, 5].map((i) => <line key={i} x1={1116 + 17.6 * i + 8} y1="298" x2={1121 + 15.6 * i + 8} y2="318" stroke="#0d1e36" strokeWidth="1.6" opacity=".75" />)}
        <rect x="1104" y="284" width="112" height="8" rx="2" fill="#0a1626" />
        <polygon points="1124,284 1196,284 1184,268 1136,268" fill="#0d1e36" stroke="#223a5e" />
        <rect x="1159" y="206" width="2" height="62" fill="#9fb6d4" />
        <rect x="1148" y="224" width="24" height="1.6" fill="#9fb6d4" />
        <g transform="translate(1160 214)">
          <g className="sc-dish"><rect x="-17" y="-2.2" width="34" height="4.4" rx="2.2" fill="#d5e3f6" /></g>
        </g>
        <circle cx="1160" cy="203" r="7" fill="#ff3b3b" opacity=".5" filter="url(#sc-glow)" className="sc-blink" />
        <circle cx="1160" cy="203" r="3" fill="#ff5a5a" className="sc-blink" />
        {!reduced && [0, 2, 4].map((d) => <circle key={d} className="sc-ring" cx="1160" cy="306" r="280" fill="none" stroke="#8fc2ff" strokeWidth="1.6" style={{ '--d': `${d}s` } as CSSProperties} />)}
      </g>

      {/* pesawat dan kontrail */}
      {reduced ? (
        <g transform="translate(560 190) rotate(8) scale(1.25)"><rect x="-440" y="-1.5" width="400" height="3" fill="url(#sc-trail)" /><Plane /></g>
      ) : (
        <>
          <g>
            <animateMotion dur="26s" repeatCount="indefinite" rotate="auto" path="M-140 205 C 320 70, 800 120, 1580 345" />
            <g transform="scale(1.25)"><rect x="-460" y="-1.5" width="414" height="3" fill="url(#sc-trail)" /><Plane /></g>
          </g>
          <g opacity=".85">
            <animateMotion dur="40s" repeatCount="indefinite" rotate="auto" begin="-14s" path="M1600 140 C 1250 70, 720 110, -180 200" />
            <g transform="scale(.55 -.55)"><rect x="-460" y="-1.5" width="414" height="3" fill="url(#sc-trail)" /><Plane /></g>
          </g>
        </>
      )}
      <rect width="1440" height="760" fill="none" />
    </svg>
  );
}

// Layar radar ATC: cincin jarak, sapuan berputar, blip yang menyala saat tersapu, dan label ala radar.
const BLIPS = [
  { a: 22, r: 0.62, t: 'GIA214', l: 'FL240' },
  { a: 74, r: 0.36, t: 'LNI390', l: 'FL180' },
  { a: 128, r: 0.74, t: 'BTK771', l: 'FL310' },
  { a: 196, r: 0.5, t: 'SJY502', l: 'FL120' },
  { a: 251, r: 0.8, t: 'CTV118', l: 'FL360' },
  { a: 318, r: 0.42, t: 'GIA865', l: 'FL090' },
];
const PERIOD = 6;
const polar = (a: number, r: number) => {
  const rad = (a * Math.PI) / 180;
  return { x: 200 + Math.sin(rad) * r * 170, y: 200 - Math.cos(rad) * r * 170 };
};

export function RadarScope() {
  const wedges = Array.from({ length: 14 }, (_, i) => {
    const a1 = -(i * 4), a2 = -((i + 1) * 4);
    const p1 = polar(a1, 1), p2 = polar(a2, 1);
    return <path key={i} d={`M200 200 L${p1.x} ${p1.y} A170 170 0 0 0 ${p2.x} ${p2.y} Z`} fill="#3ddc97" opacity={0.42 * Math.pow(1 - i / 14, 1.6)} />;
  });
  return (
    <svg className="radar" viewBox="0 0 400 400" role="img" aria-label="Ilustrasi layar radar ATC">
      <defs><radialGradient id="rd-bg" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#0a2238" /><stop offset="1" stopColor="#040c17" /></radialGradient></defs>
      <circle cx="200" cy="200" r="196" fill="url(#rd-bg)" stroke="#1d3b5c" strokeWidth="2" />
      {[0.25, 0.5, 0.75, 1].map((r) => <circle key={r} cx="200" cy="200" r={170 * r} fill="none" stroke="#3ddc97" strokeOpacity=".22" strokeWidth="1" />)}
      <line x1="200" y1="30" x2="200" y2="370" stroke="#3ddc97" strokeOpacity=".22" />
      <line x1="30" y1="200" x2="370" y2="200" stroke="#3ddc97" strokeOpacity=".22" />
      {Array.from({ length: 72 }, (_, i) => {
        const p1 = polar(i * 5, 1), p2 = polar(i * 5, i % 6 === 0 ? 0.93 : 0.97);
        return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#3ddc97" strokeOpacity={i % 6 === 0 ? 0.7 : 0.35} />;
      })}
      {[['N', 200, 22], ['E', 382, 204], ['S', 200, 388], ['W', 18, 204]].map(([t, x, y]) => <text key={String(t)} x={x as number} y={y as number} textAnchor="middle" className="rd-cardinal">{t}</text>)}
      <g className="rd-sweep">{wedges}<line x1="200" y1="200" x2="200" y2="30" stroke="#8ff0c4" strokeWidth="1.8" /></g>
      <path d="M200 192 L208 200 L200 208 L192 200 Z" fill="none" stroke="#8ff0c4" strokeWidth="1.2" />
      {BLIPS.map((b) => {
        const p = polar(b.a, b.r);
        const style = { animationDelay: `${(b.a / 360) * PERIOD - PERIOD}s` } as CSSProperties;
        return (
          <g key={b.t} className="rd-blip" style={style}>
            <rect x={p.x - 3.5} y={p.y - 3.5} width="7" height="7" fill="#b8ffe0" />
            <line x1={p.x} y1={p.y} x2={p.x + 14} y2={p.y - 14} stroke="#3ddc97" strokeOpacity=".7" />
            <text x={p.x + 17} y={p.y - 16} className="rd-tag">{b.t}</text>
            <text x={p.x + 17} y={p.y - 6} className="rd-tag rd-dim">{b.l}</text>
          </g>
        );
      })}
    </svg>
  );
}

// Logo mitra (AirNav, AILO, Telkom University). Berkas sudah dipotong dan dikecilkan di web/public/logos.
const PARTNERS = [
  { src: '/logos/airnav-indonesia.png', alt: 'AirNav Indonesia', w: 198, h: 200 },
  { src: '/logos/telkom-university.png', alt: 'Telkom University', w: 131, h: 160 },
  { src: '/logos/ailo.png', alt: "AILO, Telkom University's Center of Excellence", w: 166, h: 160 },
];

export function Partners({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  return (
    <div className={`partners ${tone}`}>
      {PARTNERS.map((p, i) => (
        <span key={p.src} className="partner">
          {i > 0 && <i className="sep" aria-hidden="true" />}
          <img src={p.src} alt={p.alt} width={p.w} height={p.h} loading="eager" decoding="async" />
        </span>
      ))}
    </div>
  );
}
