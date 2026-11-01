import { CSSProperties, RefObject, useEffect, useRef, useState } from 'react';
import { Mark, Partners, RadarScope, TowerScene, useReducedMotion } from './brand';
import { DetailDialog, FEATURE_DETAIL, STEP_DETAIL } from './landing-detail';
import './landing.css';

function useReveal(root: RefObject<HTMLElement>) {
  useEffect(() => {
    const els = Array.from(root.current?.querySelectorAll<HTMLElement>('.reveal') ?? []);
    if (typeof IntersectionObserver !== 'function') { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.14, rootMargin: '0px 0px -6% 0px' });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [root]);
}

function CountUp({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const [v, setV] = useState(reduced ? to : 0);
  useEffect(() => {
    if (reduced) { setV(to); return; }
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const run = () => {
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / 1500);
        setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { run(); io.disconnect(); } });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to, reduced]);
  return <span ref={ref}>{v.toLocaleString('id-ID')}</span>;
}

const NARASI = 'Landasan pacu 06/24 di Bandara Halim Perdanakusuma ditutup karena pekerjaan mulai tanggal 5 November 2026 pukul 08.00 WIB sampai tanggal 6 November 2026 pukul 12.00 WIB';
const LINES: { k: string; v: string; note?: string }[] = [
  { k: 'Q)', v: 'WIIF/QMRLC/IV/NBO/A/000/999/0616S10653E005', note: 'Kode Q dan FIR dari master bandara' },
  { k: 'A)', v: 'WIHH' },
  { k: 'B)', v: '2611050100', note: '08.00 WIB menjadi 01.00 UTC' },
  { k: 'C)', v: '2611060500', note: '12.00 WIB menjadi 05.00 UTC' },
  { k: 'E)', v: 'RWY 06/24 CLSD DUE TO WIP' },
];

function Narasi({ text }: { text: string }) {
  const parts = text.split(/(\d{2}\.\d{2} WIB)/g);
  return <>{parts.map((p, i) => (/WIB$/.test(p) ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>))}</>;
}

function Demo() {
  const reduced = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  const [typed, setTyped] = useState(reduced ? NARASI.length : 0);
  const [stage, setStage] = useState<'typing' | 'think' | 'out'>(reduced ? 'out' : 'typing');
  const [shown, setShown] = useState(reduced ? LINES.length : 0);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver !== 'function') { setArmed(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setArmed(true); io.disconnect(); } }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduced || !armed) return;
    let dead = false;
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    (async () => {
      while (!dead) {
        setStage('typing'); setShown(0); setTyped(0);
        for (let i = 1; i <= NARASI.length && !dead; i++) { setTyped(i); await sleep(i % 9 === 0 ? 46 : 20); }
        await sleep(500);
        if (dead) return;
        setStage('think');
        await sleep(1200);
        setStage('out');
        for (let i = 1; i <= LINES.length && !dead; i++) { setShown(i); await sleep(560); }
        await sleep(6000);
      }
    })();
    return () => { dead = true; };
  }, [reduced, armed]);

  const done = stage === 'out' && shown === LINES.length;
  return (
    <div className="demo" ref={box}>
      <div className="demo-pane in">
        <div className="demo-label"><span>Narasi dari Originator</span><em>bahasa sehari-hari</em></div>
        <p className="demo-text"><Narasi text={NARASI.slice(0, typed)} />{stage === 'typing' && <i className="caret" />}</p>
      </div>
      <div className={`demo-link ${stage}`} aria-hidden="true"><span /><b>{stage === 'think' ? 'menyusun' : stage === 'out' ? 'selesai' : ''}</b></div>
      <div className="demo-pane out">
        <div className="demo-label"><span>NOTAM hasil susunan</span><em>format ICAO</em></div>
        <div className="demo-notam" role="img" aria-label="Contoh NOTAM hasil susunan sistem">
          {LINES.map((l, i) => (
            <div key={l.k} className={`ln ${i < shown ? 'on' : ''}`}>
              <b>{l.k}</b><code>{l.v}</code>{l.note && <small>{l.note}</small>}
            </div>
          ))}
          <div className={`verdict ${done ? 'on' : ''}`}><i />Lolos validasi format, FIR, dan waktu UTC</div>
        </div>
        {stage === 'think' && <div className="shimmer" aria-hidden="true" />}
      </div>
    </div>
  );
}

const STEPS = [
  { who: 'Originator', head: 'Menulis dan menyusun', body: 'Menulis kondisi bandara dengan tanggal spesifik. Sistem menyusun NOTAM; teks bisa diubah dan disusun ulang sampai siap, lalu dikirim ke ATS atau langsung ke PIA.' },
  { who: 'ATS', head: 'Meninjau', opt: true, body: 'Memeriksa isi dan memutuskan Accept, Revisi, atau Reject. Revisi dan Reject wajib disertai catatan. Tahap ini dapat dilewati bila Originator memilih langsung ke PIA.' },
  { who: 'PIA', head: 'Memeriksa lanjutan', body: 'Meninjau hasil ATS. Revisi ke Originator dibatasi tiga kali agar proses tidak berputar tanpa ujung.' },
  { who: 'NOF', head: 'Menyetujui', body: 'Persetujuan akhir. Bila ada yang perlu diperbaiki, pengajuan dikembalikan ke PIA, bukan ke awal.' },
];

const FEATURES = [
  { h: 'Susun otomatis', p: 'Narasi bebas menjadi item Q, A, B, C, D, dan E berformat ICAO, dengan 927 contoh NOTAM sebagai rujukan gaya penulisan.' },
  { h: 'Waktu UTC otomatis', p: 'Jam WIB, WITA, dan WIT dikonversi ke UTC oleh kode, bukan ditebak model. Validator mengunci item B dan C agar sesuai.' },
  { h: 'Validasi berlapis', p: 'Format Q, FIR dari master bandara, jadwal harian, dan catatan diperiksa. Setiap koreksi otomatis dicatat dan terlihat oleh peninjau.' },
  { h: 'Alur persetujuan', p: 'Empat peran dengan hak akses yang ditegakkan di server. Riwayat lengkap tiap pengajuan, termasuk siapa, kapan, dan catatannya.' },
  { h: 'Ringkasan eksekutif', p: 'Tingkat persetujuan, waktu penyelesaian, tahap yang paling lama, dan kualitas AI. Unduh sebagai Excel atau PowerPoint rapi.' },
  { h: 'Terkendali', p: 'Jeda generate, jam layanan, dan kuota per pengguna dari dashboard admin. Audit log mencatat semua aksi penting.' },
];

function MiniAnalytics() {
  const bars = [38, 52, 44, 66, 58, 80, 72];
  return (
    <div className="mini-an" aria-hidden="true">
      <div className="mini-top"><span>Ringkasan eksekutif</span><em>ilustrasi tampilan</em></div>
      <div className="mini-kpi">
        {['Tingkat persetujuan', 'Waktu penyelesaian', 'Lolos validasi AI'].map((l) => <div key={l}><i className="skel" /><span>{l}</span></div>)}
      </div>
      <div className="mini-chart">
        <div className="bars">{bars.map((h, i) => <i key={i} style={{ '--h': `${h}%`, '--i': i } as CSSProperties} />)}</div>
        <svg viewBox="0 0 200 80" preserveAspectRatio="none"><path className="trend" d="M0 60 C 25 52, 40 58, 60 40 S 100 44, 125 28 S 170 20, 200 8" /></svg>
      </div>
      <div className="mini-foot"><span><i className="d a" />Diajukan</span><span><i className="d b" />Disetujui</span></div>
    </div>
  );
}

export function Landing({ onLogin }: { onLogin: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [detail, setDetail] = useState<{ kind: 'step' | 'fitur'; i: number } | null>(null);
  useReveal(root);
  const open = (kind: 'step' | 'fitur', i: number) => ({
    role: 'button' as const, tabIndex: 0, 'aria-haspopup': 'dialog' as const,
    onClick: () => setDetail({ kind, i }),
    onKeyDown: (e: { key: string; preventDefault: () => void }) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetail({ kind, i }); } },
  });
  const move = (delta: number) => setDetail((d) => (d ? { ...d, i: (d.i + delta + (d.kind === 'step' ? STEPS.length : FEATURES.length)) % (d.kind === 'step' ? STEPS.length : FEATURES.length) } : d));
  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 24);
    f();
    window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, []);
  const go = (id: string) => (e: { preventDefault: () => void }) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  return (
    <div className="lp" ref={root}>
      <header className={`lp-nav ${scrolled ? 'solid' : ''}`}>
        <a className="lp-brand" href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
          <Mark size={34} /><span>NOTAM <b>AI</b> Generator</span>
        </a>
        <nav className="lp-links">
          <a href="#cara" onClick={go('cara')}>Cara kerja</a>
          <a href="#fitur" onClick={go('fitur')}>Fitur</a>
          <a href="#kendali" onClick={go('kendali')}>Kendali</a>
        </nav>
        <Partners tone={scrolled ? 'light' : 'dark'} />
        <button className="lp-cta sm" onClick={onLogin}>Masuk</button>
      </header>

      <section className="lp-hero">
        <TowerScene />
        <div className="lp-shade" />
        <div className="lp-hero-in">
          <p className="lp-pill rise" style={{ '--r': '0s' } as CSSProperties}><i />Untuk alur kerja NOTAM Indonesia</p>
          <h1 className="rise" style={{ '--r': '.08s' } as CSSProperties}>Dari narasi bebas menjadi <span className="grad">NOTAM siap ditinjau.</span></h1>
          <p className="lp-sub rise" style={{ '--r': '.18s' } as CSSProperties}>Tulis kondisi bandara dengan bahasa sehari-hari. Sistem menyusun NOTAM berformat ICAO, mengonversi jam lokal ke UTC, memeriksa aturannya, lalu meneruskannya ke ATS, PIA, dan NOF.</p>
          <div className="lp-actions rise" style={{ '--r': '.28s' } as CSSProperties}>
            <button className="lp-cta" onClick={onLogin}>Masuk ke aplikasi</button>
            <a className="lp-ghost" href="#cara" onClick={go('cara')}>Lihat cara kerja</a>
          </div>
          <dl className="lp-stats rise" style={{ '--r': '.4s' } as CSSProperties}>
            <div><dt><CountUp to={927} /></dt><dd>contoh NOTAM sebagai rujukan</dd></div>
            <div><dt><CountUp to={4} /></dt><dd>peran dalam satu alur persetujuan</dd></div>
            <div><dt>UTC</dt><dd>konversi jam lokal otomatis</dd></div>
          </dl>
        </div>
        <a className="lp-scroll" href="#demo" onClick={go('demo')} aria-label="Gulir ke demo"><span /></a>
      </section>

      <section className="lp-sec" id="demo">
        <div className="lp-wrap">
          <p className="eyebrow reveal">Lihat hasilnya</p>
          <h2 className="reveal">Satu kalimat masuk, satu NOTAM keluar.</h2>
          <p className="lead reveal">Perhatikan item B dan C: jam 08.00 dan 12.00 WIB otomatis menjadi 01.00 dan 05.00 UTC. Bagian inilah yang paling sering keliru bila dikerjakan manual.</p>
          <div className="reveal"><Demo /></div>
          <p className="fine reveal">Contoh ilustrasi. Hasil sungguhan bergantung pada narasi dan data master bandara, dan tetap wajib ditinjau petugas berwenang.</p>
        </div>
      </section>

      <section className="lp-sec alt" id="cara">
        <div className="lp-wrap">
          <p className="eyebrow reveal">Cara kerja</p>
          <h2 className="reveal">Empat tahap, satu jejak yang utuh.</h2>
          <ol className="flow">
            {STEPS.map((s, i) => (
              <li key={s.who} className="step reveal" style={{ '--i': i } as CSSProperties} {...open('step', i)}>
                <span className="num">{String(i + 1).padStart(2, '0')}</span>
                <h3>{s.who}{'opt' in s && s.opt && <em className="opt">Opsional</em>}</h3>
                <strong>{s.head}</strong>
                <p>{s.body}</p>
                <span className="more">Lihat prosesnya</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="lp-sec" id="fitur">
        <div className="lp-wrap">
          <p className="eyebrow reveal">Fitur</p>
          <h2 className="reveal">Dibuat untuk ketelitian, bukan sekadar kecepatan.</h2>
          <div className="feats">
            {FEATURES.map((f, i) => (
              <article key={f.h} className="feat reveal" style={{ '--i': i } as CSSProperties} {...open('fitur', i)}>
                <span className="fn">{String(i + 1).padStart(2, '0')}</span>
                <h3>{f.h}</h3>
                <p>{f.p}</p>
                <span className="more">Lihat cara kerjanya</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-sec alt">
        <div className="lp-wrap split">
          <div>
            <p className="eyebrow reveal">Ringkasan eksekutif</p>
            <h2 className="reveal">Keputusan yang didukung angka.</h2>
            <p className="lead reveal">Dashboard menampilkan volume pengajuan, tingkat persetujuan, tahap yang paling lama menahan proses, dan kualitas hasil AI. Satu klik untuk mengunduh Excel atau PowerPoint yang rapi untuk rapat.</p>
            <ul className="ticks reveal">
              <li>Filter periode dan bandara</li>
              <li>Ekspor Excel dengan data per pengajuan</li>
              <li>Ekspor PowerPoint dengan grafik yang bisa diedit</li>
            </ul>
          </div>
          <div className="reveal"><MiniAnalytics /></div>
        </div>
      </section>

      <section className="lp-sec dark" id="kendali">
        <div className="lp-wrap split">
          <div className="radar-wrap reveal"><RadarScope /></div>
          <div>
            <p className="eyebrow reveal">Kendali penuh</p>
            <h2 className="reveal">Data tetap di tangan Anda.</h2>
            <p className="lead reveal">Model bahasa dapat berjalan sepenuhnya di server sendiri, sehingga narasi tidak perlu dikirim ke layanan luar. Pemakaian bisa diatur kapan saja.</p>
            <ul className="ticks reveal">
              <li>Hak akses per peran ditegakkan di server</li>
              <li>Audit log tidak dapat diubah lewat aplikasi</li>
              <li>Jeda generate, jam layanan, dan kuota harian dari dashboard</li>
              <li>Server tidak dapat dijangkau? Pengguna diberi tahu dengan jelas</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="lp-band">
        <div className="lp-wrap reveal">
          <h2>Siap menyusun NOTAM berikutnya?</h2>
          <button className="lp-cta" onClick={onLogin}>Masuk ke aplikasi</button>
        </div>
      </section>

      {detail && (() => {
        const isStep = detail.kind === 'step';
        const data = isStep ? STEP_DETAIL[detail.i] : FEATURE_DETAIL[detail.i];
        const head = isStep ? STEPS[detail.i] : FEATURES[detail.i];
        return (
          <DetailDialog eyebrow={isStep ? `Langkah ${detail.i + 1} dari ${STEPS.length}` : `Fitur ${detail.i + 1} dari ${FEATURES.length}`}
            title={isStep ? (head as (typeof STEPS)[number]).who : (head as (typeof FEATURES)[number]).h}
            subtitle={isStep && 'opt' in head && head.opt ? 'Opsional' : undefined}
            bullets={data.bullets} hasil={data.hasil} sim={data.sim} index={detail.i} total={isStep ? STEPS.length : FEATURES.length}
            onClose={() => setDetail(null)} onMove={move} />
        );
      })()}

      <footer className="lp-foot">
        <div className="lp-wrap foot">
          <div className="fb"><Mark size={30} /><div><strong>NOTAM AI Generator</strong><p>NOTAM hasil susunan sistem adalah draf dan wajib ditinjau petugas yang berwenang sebelum diterbitkan.</p></div></div>
          <Partners tone="light" />
        </div>
      </footer>
    </div>
  );
}
