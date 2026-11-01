import { CSSProperties, ReactNode, useEffect, useRef, useState } from 'react';

// Mengulang animasi: key berubah tiap `ms`, sehingga simulasi dipasang ulang dan CSS animation mulai dari awal.
function useCycle(ms: number) {
  const [n, setN] = useState(0);
  useEffect(() => { const t = setInterval(() => setN((x) => x + 1), ms); return () => clearInterval(t); }, [ms]);
  return n;
}
const d = (i: number): CSSProperties => ({ '--i': i } as CSSProperties);
const Tick = () => <i className="tk" aria-hidden="true" />;

// ---------- simulasi tahap (proses bergerak) ----------
function SimOriginator() {
  return (
    <div className="sim-body">
      <div className="sq" style={d(0)}><span className="cap">Narasi</span><p className="typed">Landasan pacu 06/24 ditutup karena pekerjaan mulai 5 November 2026 pukul 08.00 WIB…</p></div>
      <div className="sq" style={d(3)}><span className="cap">Menyusun NOTAM</span><div className="prog"><i className="fill" style={{ '--t': '2.2s' } as CSSProperties} /></div><small className="dim">memeriksa kode Q, FIR, waktu UTC, dan aturan format</small></div>
      <div className="sq mono-box" style={d(7)}>
        {['Q) WIIF/QMRLC/IV/NBO/A/000/999/0616S10653E005', 'A) WIHH', 'B) 2611050100', 'C) 2611060500', 'E) RWY 06/24 CLSD DUE TO WIP'].map((l, i) => <div key={l} className="ln sq" style={d(8 + i * 0.6)}>{l}</div>)}
      </div>
      <div className="sq choose" style={d(13)}><span className="chip on">Ke ATS</span><span className="chip">Langsung ke PIA</span><span className="btn press">Submit</span></div>
      <div className="sq sent" style={d(15)}><Tick /> Terkirim ke ATS · status Review ATS</div>
    </div>
  );
}

function SimAts() {
  return (
    <div className="sim-body">
      <div className="sq incoming" style={d(0)}><b className="mono">FRM-2026-00012</b><span>pesan asli dan draf AI berdampingan</span></div>
      {['Isi sesuai pesan asli', 'Format Q, A, B, C, E valid', 'Waktu UTC sesuai narasi'].map((t, i) => <div key={t} className="sq check" style={d(2.5 + i * 1.6)}><Tick />{t}</div>)}
      <div className="sq decide" style={d(8)}><span className="btn ok pulse">Accept</span><span className="btn warn">Revisi</span><span className="btn bad">Reject</span></div>
      <div className="sq sent" style={d(10)}><Tick /> Diteruskan ke PIA</div>
      <small className="sq dim" style={d(11)}>Revisi dan Reject wajib bercatatan. Revisi kembali ke Originator; Reject berarti pengajuan baru.</small>
    </div>
  );
}

function SimPia() {
  return (
    <div className="sim-body">
      <div className="sq incoming" style={d(0)}><b className="mono">FRM-2026-00012</b><span>dari ATS atau langsung dari Originator</span></div>
      <div className="sq loop" style={d(2)}>
        <span className="node">PIA</span><span className="path">Revisi</span><span className="node">Originator</span>
      </div>
      {[1, 2, 3].map((n) => <div key={n} className="sq rev" style={d(3 + n * 1.8)}><span className="dots">{[1, 2, 3].map((k) => <i key={k} className={k <= n ? 'on' : ''} />)}</span>Revisi ke-{n} dari 3</div>)}
      <div className="sq limit" style={d(9.5)}>Batas tercapai: hanya Accept atau Reject</div>
      <div className="sq decide" style={d(11)}><span className="btn ok pulse">Accept</span><span className="btn bad">Reject</span></div>
      <div className="sq sent" style={d(12.5)}><Tick /> Diteruskan ke NOF</div>
    </div>
  );
}

function SimNof() {
  return (
    <div className="sim-body">
      <div className="sq incoming" style={d(0)}><b className="mono">FRM-2026-00012</b><span>diteruskan oleh PIA</span></div>
      <div className="sq check" style={d(2)}><Tick />Tinjauan akhir atas NOTAM dan catatan sebelumnya</div>
      <div className="sq decide" style={d(4)}><span className="btn ok pulse">Accept</span><span className="btn warn">Revisi</span><span className="btn bad">Reject</span></div>
      <div className="stamp" style={d(6)}>DISETUJUI NOF</div>
      <small className="sq dim" style={d(8)}>Revisi atau Reject mengembalikan ke PIA, bukan ke awal, dan tidak dihitung dalam batas 3 kali.</small>
    </div>
  );
}

// ---------- simulasi fitur ----------
function SimSusun() {
  return (
    <div className="sim-body">
      <div className="sq" style={d(0)}><span className="cap">Narasi</span><p className="typed">Taxiway A ditutup karena pekerjaan pelapisan mulai 5 November 2026 pukul 22.00 WITA…</p></div>
      <div className="sq" style={d(3)}><span className="cap">Mencari contoh serupa</span><div className="refs">{['Contoh 1', 'Contoh 2', 'Contoh 3'].map((t, i) => <span key={t} className="chip sq" style={d(3.4 + i * 0.5)}>{t}</span>)}</div><small className="dim">dari 927 NOTAM rujukan</small></div>
      <div className="sq mono-box" style={d(6)}>
        {['Q) WAAF/QMXLC/IV/NBO/A/000/999/0845S11510E005', 'A) WADD', 'B) 2611051400', 'C) 2611062100', 'E) TWY A CLSD DUE TO WIP'].map((l, i) => <div key={l} className="ln sq" style={d(6.4 + i * 0.6)}>{l}</div>)}
      </div>
    </div>
  );
}

function SimUtc() {
  const rows: [string, string, string, string][] = [['08.00 WIB', '− 7 jam', '01.00 UTC', '2611050100'], ['08.00 WITA', '− 8 jam', '00.00 UTC', '2611050000'], ['08.00 WIT', '− 9 jam', '23.00 UTC (4 Nov)', '2611042300']];
  return (
    <div className="sim-body">
      {rows.map(([from, off, to, code], i) => (
        <div key={from} className="sq conv" style={d(i * 2.4)}>
          <span className="chip">{from}</span><span className="off">{off}</span><span className="chip on">{to}</span><code>B) {code}</code>
        </div>
      ))}
      <small className="sq dim" style={d(7.5)}>Jam yang melewati tengah malam menggeser tanggal. Jam tanpa label zona ditulis apa adanya.</small>
    </div>
  );
}

function SimValidasi() {
  const rows: [string, boolean, string?][] = [['Garis Q sesuai pola', true], ['FIR sesuai master bandara', false, 'WAAF diganti WIIF (dikoreksi otomatis)'], ['B) dan C) sama dengan konversi UTC', true], ['D) memuat jam yang valid', true], ['RMK tidak kosong', true]];
  return (
    <div className="sim-body">
      {rows.map(([t, ok, fix], i) => (
        <div key={t} className={`sq check ${ok ? '' : 'fix'}`} style={d(i * 1.7)}>
          {ok ? <Tick /> : <i className="tk fx" aria-hidden="true" />}<span>{t}{fix && <em>{fix}</em>}</span>
        </div>
      ))}
      <div className="sq sent" style={d(9)}><Tick /> Lolos validasi · 1 koreksi tercatat dan terlihat peninjau</div>
    </div>
  );
}

function SimAlur() {
  return (
    <div className="sim-body">
      <div className="lane" aria-hidden="true">
        {['Originator', 'ATS', 'PIA', 'NOF'].map((t, i) => <span key={t} className="node" style={d(i)}>{t}</span>)}
        <i className="token" />
        <i className="back" />
      </div>
      <div className="sq status" style={d(1)}>Review ATS</div>
      <div className="sq status" style={d(3.2)}>Review PIA</div>
      <div className="sq status" style={d(5.4)}>Review NOF</div>
      <div className="sq sent" style={d(7.4)}><Tick /> Disetujui NOF · seluruh langkah tercatat dengan pelaku, waktu, dan catatan</div>
    </div>
  );
}

function SimRingkasan() {
  return (
    <div className="sim-body">
      <div className="sq skel-row" style={d(0)}>{['Tingkat persetujuan', 'Waktu penyelesaian', 'Tahap terlama'].map((t) => <div key={t} className="skel-card"><i className="skel" /><span>{t}</span></div>)}</div>
      <div className="sq bars" style={d(1)}>{[40, 62, 50, 78, 66, 90, 74].map((h, i) => <i key={i} style={{ '--h': `${h}%`, '--k': i } as CSSProperties} />)}</div>
      <div className="sq export" style={d(4)}><span className="btn">Unduh Excel</span><span className="btn pri pulse">Unduh PowerPoint</span></div>
      <small className="sq dim" style={d(5.5)}>Ilustrasi bentuk laporan. Angka sungguhan hanya muncul dari pengajuan yang ada.</small>
    </div>
  );
}

function SimTerkendali() {
  return (
    <div className="sim-body">
      <div className="sq ctl" style={d(0)}><span>Generate</span><span className="switch"><i /></span><b>Dijeda</b></div>
      <div className="sq ctl" style={d(2.5)}><span>Kuota harian</span><div className="prog"><i className="fill q" style={{ '--t': '2.4s' } as CSSProperties} /></div></div>
      <div className="sq ctl" style={d(5)}><span>Jam layanan</span><code>08:00-17:00</code></div>
      <div className="sq mono-box" style={d(6.5)}>
        {['USER_UPDATE · role diubah', 'SERVER_GATE · generate dijeda', 'LOGIN_FAIL · percobaan ke-3'].map((l, i) => <div key={l} className="ln sq" style={d(7 + i * 0.8)}>{l}</div>)}
      </div>
      <small className="sq dim" style={d(9.6)}>Audit log hanya bisa ditambah; password tidak pernah dicatat.</small>
    </div>
  );
}

// ---------- isi rincian ----------
export const STEP_DETAIL: { bullets: string[]; hasil: string; sim: () => ReactNode; extra?: string }[] = [
  { bullets: ['Memilih bandara dan menulis narasi dengan tanggal spesifik (bukan "hari ini"), atau memakai contoh pesan.', 'Sistem mencari contoh serupa dari 927 NOTAM, menyusun item Q sampai E, mengonversi jam lokal ke UTC, lalu memeriksa aturannya.', 'Originator memeriksa draf. Teks bisa diubah dan disusun ulang; setiap versi tersimpan.', 'Memilih jalur ke ATS atau langsung ke PIA, lalu Submit (ada peringatan sebelum kirim).'], hasil: 'Pengajuan bernomor form dengan status Review ATS atau Review PIA.', sim: () => <SimOriginator /> },
  { bullets: ['Menerima pengajuan dengan pesan asli dan draf AI berdampingan, lengkap dengan hasil validasi dan koreksi otomatis.', 'Memeriksa isi, format, dan waktu UTC.', 'Memutuskan: Accept (ke PIA), Revisi (kembali ke Originator), atau Reject (ditolak; perlu pengajuan baru).', 'Revisi dan Reject wajib disertai catatan.'], hasil: 'Keputusan tercatat dengan pelaku, waktu, dan catatan. Tahap ini opsional: Originator boleh langsung ke PIA.', sim: () => <SimAts /> },
  { bullets: ['Menerima pengajuan dari ATS, atau langsung dari Originator bila ATS dilewati.', 'Memutuskan Accept (ke NOF), Revisi, atau Reject.', 'Revisi ke Originator dibatasi tiga kali agar proses tidak berputar tanpa ujung; setelah itu hanya Accept atau Reject.', 'Dapat mengunduh daftar sebagai Excel dan surat pengajuan sebagai PDF.'], hasil: 'Pengajuan diteruskan ke NOF, atau dikembalikan dengan catatan.', sim: () => <SimPia /> },
  { bullets: ['Menerima pengajuan yang diteruskan PIA; daftar menampilkan PIA yang meneruskan dan tanggalnya.', 'Accept menyatakan NOTAM disetujui.', 'Revisi atau Reject mengembalikan ke PIA, bukan ke awal, dan tidak dihitung dalam batas tiga kali.', 'Hasil akhir tetap berupa draf: penerbitan resmi dilakukan petugas berwenang.'], hasil: 'Status Disetujui NOF; PDF dan Excel dapat diunduh.', sim: () => <SimNof /> },
];

export const FEATURE_DETAIL: { bullets: string[]; hasil: string; sim: () => ReactNode }[] = [
  { bullets: ['Narasi bebas diterjemahkan menjadi item Q, A, B, C, D, dan E berformat ICAO.', 'Sistem mengambil beberapa contoh serupa dari 927 NOTAM sebagai rujukan gaya penulisan; model tidak dilatih ulang.', 'Model bahasa dapat berjalan di server sendiri sehingga narasi tidak keluar dari lingkungan Anda.'], hasil: 'Draf NOTAM lengkap yang siap ditinjau, dengan lama penyusunan ditampilkan.', sim: () => <SimSusun /> },
  { bullets: ['Jam WIB, WITA, dan WIT dikonversi ke UTC oleh kode, bukan ditebak model.', 'Jam yang melewati tengah malam menggeser tanggal dengan benar.', 'Validator mengunci item B dan C agar sama dengan hasil konversi; selisih dianggap kesalahan.'], hasil: 'Item B dan C selalu dalam format YYMMDDHHMM UTC yang konsisten dengan narasi.', sim: () => <SimUtc /> },
  { bullets: ['Format garis Q, FIR dari master 565 bandara, jadwal harian (D), dan catatan (RMK) diperiksa otomatis.', 'Kesalahan yang dapat dipastikan diperbaiki oleh kode, misalnya FIR dan konversi waktu.', 'Setiap koreksi dicatat per versi dan terlihat oleh peninjau.'], hasil: 'Status validasi lolos, peringatan, atau gagal, beserta alasannya.', sim: () => <SimValidasi /> },
  { bullets: ['Empat peran dengan hak akses yang ditegakkan di server, bukan hanya disembunyikan di layar.', 'Jalur dapat melewati ATS; revisi PIA dibatasi tiga kali; NOF mengembalikan ke PIA.', 'Riwayat lengkap tiap pengajuan: siapa, kapan, aksi, dan catatannya.'], hasil: 'Satu jejak yang utuh dari penyusunan sampai persetujuan.', sim: () => <SimAlur /> },
  { bullets: ['Tingkat persetujuan, waktu penyelesaian, tahap yang paling lama menahan proses, dan kualitas hasil AI.', 'Laporan menurut jenis NOTAM: kelompok, subjek, kondisi, tren, dan bandara.', 'Unduh sebagai Excel (dengan data tiap NOTAM) atau PowerPoint dengan grafik yang dapat diedit.'], hasil: 'Bahan rapat yang rapi, dari data pengajuan yang sebenarnya.', sim: () => <SimRingkasan /> },
  { bullets: ['Admin dapat menjeda generate, mengatur jam layanan, dan membatasi kuota harian per pengguna.', 'Audit log mencatat login, perubahan akun, pengaturan server, dan aksi NOTAM; tidak dapat diubah lewat aplikasi.', 'Bila server tidak dapat dijangkau, pengguna diberi tahu dengan jelas.'], hasil: 'Pemakaian dapat dibatasi kapan saja dan setiap aksi penting dapat ditelusuri.', sim: () => <SimTerkendali /> },
];

// ---------- dialog ----------
export function DetailDialog({ eyebrow, title, subtitle, bullets, hasil, sim, index, total, onClose, onMove }: {
  eyebrow: string; title: string; subtitle?: string; bullets: string[]; hasil: string; sim: () => ReactNode; index: number; total: number; onClose: () => void; onMove: (delta: number) => void;
}) {
  const cycle = useCycle(17000);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') onMove(1); if (e.key === 'ArrowLeft') onMove(-1); };
    window.addEventListener('keydown', key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = prev; };
  }, [onClose, onMove]);
  return (
    <div className="lp-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lp-dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title" tabIndex={-1} ref={box}>
        <button className="dlg-x" aria-label="Tutup rincian" onClick={onClose} />
        <div className="dlg-grid">
          <div className="dlg-text">
            <p className="eyebrow">{eyebrow}</p>
            <h3 id="dlg-title">{title}{subtitle && <em className="opt">{subtitle}</em>}</h3>
            <ul>{bullets.map((b) => <li key={b}>{b}</li>)}</ul>
            <p className="hasil"><b>Hasil:</b> {hasil}</p>
          </div>
          <div className="sim" aria-label="Simulasi proses (animasi)">
            <div className="sim-bar"><i /><i /><i /><span>simulasi proses</span></div>
            <div key={`${index}-${cycle}`} className="sim-run">{sim()}</div>
          </div>
        </div>
        <div className="dlg-nav">
          <button onClick={() => onMove(-1)}>Sebelumnya</button>
          <span className="muted">{index + 1} dari {total}</span>
          <button onClick={() => onMove(1)}>Berikutnya</button>
        </div>
      </div>
    </div>
  );
}
