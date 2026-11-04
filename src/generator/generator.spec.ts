import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join } from 'path';
import { RagGenerator, MockLlm, OllamaLlm, correctNotam, providerFromEnv } from './generator';
import { buildPrompt, retrieve } from './rag';
import { findAirport, mentionedLocators, tzOf } from '../master/airports';
import { annotateLocalTimes, expectedUtcPlan, expectedUtcStamps } from '../master/time';
import { tpsWarnings } from '../master/tps';
import { validateNotam } from './validator';
import { BLOCKING } from '../requests/requests.service';

const GOOD = `Q) WIIF/QMRLC/IV/NBO/A/000/999/0616S10653E005
A) WIHH
B) 2411011700
C) 2411020500
E) RWY 06/24 CLSD DUE TO WIP`;

describe('validator', () => {
  it('NOTAM benar lolos', () => {
    expect(validateNotam(GOOD, 'WIHH')).toEqual({ status: 'passed', issues: [] });
  });

  it('mendeteksi kesalahan deterministik', () => {
    const codes = (t: string) => validateNotam(t, 'WIHH').issues.map((i) => i.code);
    expect(codes(GOOD.replace('A) WIHH', 'A) WIII'))).toContain('A_MISMATCH');
    expect(codes(GOOD.replace('2411011700', '2413011700'))).toContain('B_FORMAT'); // bulan 13
    expect(codes(GOOD.replace('2411020500', '2411010500'))).toContain('C_BEFORE_B');
    expect(codes(GOOD.replace('E) RWY 06/24 CLSD DUE TO WIP', ''))).toContain('MISSING_E');
    expect(codes('[MOCK] teks')).toEqual(expect.arrayContaining(['MISSING_Q', 'MISSING_A']));
    expect(codes(GOOD.replace('WIIF', 'WAAF'))).toContain('Q_FIR');
  });

  it('menerima PERM, EST dan E) multi-baris', () => {
    expect(validateNotam(GOOD.replace('2411020500', '2411020500EST'), 'WIHH').status).toBe('passed');
    expect(validateNotam(GOOD.replace('2411020500', 'PERM'), 'WIHH').status).toBe('passed');
    expect(validateNotam(GOOD + '\nRMK: ALL TFC CTN', 'WIHH').status).toBe('passed');
  });
});

describe('validator waktu UTC', () => {
  const input = 'ditutup tanggal 01 November 2024 pukul 08.00 WIB sampai tanggal 02 November 2024 pukul 12.00 WIB karena pekerjaan';
  const codes = (t: string) => validateNotam(t, 'WIHH', input).issues.map((i) => i.code);
  it('menerima B/C hasil konversi UTC dan menolak jam lokal yang tidak dikonversi', () => {
    expect(codes(GOOD.replace('2411011700', '2411010100').replace('2411020500', '2411020500'))).toEqual([]);
    expect(codes(GOOD)).toEqual(expect.arrayContaining(['B_UTC_MISMATCH']));
    expect(codes(GOOD.replace('2411011700', '2411010800').replace('2411020500', '2411021200'))).toEqual(['B_UTC_MISMATCH', 'C_UTC_MISMATCH']);
  });
  it('jam tanpa label zona tidak diperiksa', () => {
    const t = (n: string) => validateNotam(GOOD, 'WIHH', n).status;
    expect(t('ditutup tanggal 01 November 2024 pukul 17.00 sampai tanggal 02 November 2024 pukul 05.00 karena pekerjaan')).toBe('passed');
  });
  it('tanggal tidak terbaca di input -> tidak diperiksa', () => {
    expect(validateNotam(GOOD, 'WIHH', 'runway ditutup karena pekerjaan').status).toBe('passed');
  });
});

describe('validator D) dan RMK', () => {
  const withD = (d: string) => GOOD.replace('E)', `D) ${d}\nE)`);
  const codes = (t: string, input?: string) => validateNotam(t, 'WIHH', input).issues.map((i) => i.code);
  it('D) harus berisi rentang jam yang valid', () => {
    expect(codes(withD('DAILY 1500-1915'))).toEqual([]);
    expect(codes(withD('MON WED FRI 0000-2400'))).toEqual([]);
    expect(codes(withD('DAILY'))).toEqual(['D_FORMAT']);
    expect(codes(withD('DAILY 2500-1915'))).toEqual(['D_FORMAT']);
    expect(codes(withD('DAILY 1500-1975'))).toEqual(['D_FORMAT']);
  });
  it('input menyebut jadwal berulang tetapi D) tidak ada -> warning', () => {
    expect(codes(GOOD, 'ditutup setiap hari pukul 15.00 sampai 19.15 karena pekerjaan')).toEqual(['D_MISSING']);
    expect(codes(withD('DAILY 1500-1915'), 'ditutup setiap hari pukul 15.00 sampai 19.15 karena pekerjaan')).toEqual([]);
  });
  it('RMK harus berisi teks dan muncul bila input punya Catatan', () => {
    expect(codes(GOOD + ' RMK: ALL ACFT CTN')).toEqual([]);
    expect(codes(GOOD + ' RMK:')).toEqual(['RMK_EMPTY']);
    expect(codes(GOOD, 'runway ditutup karena pekerjaan. Catatan: semua pesawat berhati-hati')).toEqual(['RMK_MISSING']);
    expect(codes(GOOD + ' RMK : ALL ACFT CTN', 'runway ditutup. Catatan: semua pesawat berhati-hati karena pekerjaan')).toEqual([]);
  });
});

describe('koreksi deterministik', () => {
  const input = 'ditutup tanggal 01 November 2024 pukul 08.00 WIB sampai tanggal 02 November 2024 pukul 12.00 WIB karena pekerjaan';
  it('memperbaiki FIR, B) dan C) serta mencatatnya', () => {
    const bad = GOOD.replace('WIIF', 'WAAF').replace('2411011700', '2411010800').replace('2411020500', '2411021200');
    const r = correctNotam(bad, findAirport('WIHH')!, input);
    expect(r.text).toBe(GOOD.replace('2411011700', '2411010100'));
    expect(r.corrections).toHaveLength(3);
    expect(validateNotam(r.text, 'WIHH', input).status).toBe('passed');
  });
  it('tidak mengubah apa pun bila sudah benar', () => {
    expect(correctNotam(GOOD, findAirport('WIHH')!, 'runway ditutup karena pekerjaan')).toEqual({ text: GOOD, corrections: [] });
  });
});

describe('master bandara', () => {
  it('menemukan bandara dan locator lain di teks', () => {
    expect(findAirport('WIHH')?.name).toMatch(/HALIM/);
    expect(findAirport('ZZZZ')).toBeUndefined();
    expect(mentionedLocators('Runway WIHH dan WADD ditutup, bukan HARI')).toEqual(['WIHH', 'WADD']);
  });
});

describe('zona waktu', () => {
  it('menurunkan zona dari ARP', () => {
    expect(tzOf(findAirport('WIHH')!)).toEqual({ label: 'WIB', offset: 7 });
    expect(tzOf(findAirport('WADD')!)).toEqual({ label: 'WITA', offset: 8 });
    expect(tzOf(findAirport('WAJJ')!)).toEqual({ label: 'WIT', offset: 9 }); // Sentani
  });

  it('mengonversi jam berlabel ke UTC termasuk pergantian tanggal; jam tanpa label dibiarkan', () => {
    expect(annotateLocalTimes('tutup 08.00-17.30 WIB')).toBe('tutup 08.00-17.30 WIB [UTC 1030]');
    expect(annotateLocalTimes('mulai 03:00 WIB')).toBe('mulai 03:00 WIB [UTC 2000, tanggal -1 hari]');
    expect(annotateLocalTimes('10.00 WITA')).toBe('10.00 WITA [UTC 0200]');
    expect(annotateLocalTimes('10.00 UTC dan 11.00')).toBe('10.00 UTC dan 11.00');
    // format 4 digit tanpa pemisah
    expect(annotateLocalTimes('tutup 0000 WIB')).toBe('tutup 0000 WIB [UTC 1700, tanggal -1 hari]');
    expect(annotateLocalTimes('mulai 2200 WITA')).toBe('mulai 2200 WITA [UTC 1400]');
    expect(annotateLocalTimes('buka 0800 WIB')).toBe('buka 0800 WIB [UTC 0100]');
    // angka lain tidak boleh terbaca sebagai jam
    expect(annotateLocalTimes('1000 UTC')).toBe('1000 UTC');
    expect(annotateLocalTimes('12345 WIB')).toBe('12345 WIB');
    expect(annotateLocalTimes('2460 WIB')).toBe('2460 WIB');
  });

  it('stempel UTC yang diharapkan juga dihitung untuk jam 4 digit tanpa pemisah', () => {
    expect(expectedUtcStamps('5 November 2026 pukul 0000 WIB')).toEqual(['2611041700']);
    expect(expectedUtcStamps('5 November 2026 pukul 0800 WIB')).toEqual(['2611050100']);
    expect(expectedUtcStamps('5 November 2026 pukul 07.30 WIB')).toEqual(['2611050030']);
  });
});

describe('retrieval & prompt', () => {
  it('mengambil contoh yang relevan dan menyusun prompt', () => {
    const r = retrieve('Landasan pacu 06/24 ditutup karena pekerjaan', 3);
    expect(r.length).toBeGreaterThan(0);
    const p = buildPrompt('Landasan pacu 06/24 ditutup', findAirport('WIHH')!);
    expect(p).toContain('LocId WIHH');
    expect(p).toContain('FIR WIIF');
    expect(p).toContain('Input:\nLandasan pacu 06/24 ditutup');
    expect(p).toContain('jangan mengarang');
    expect(p).toContain('zona waktu lokal WIB (UTC+7)');
    expect(buildPrompt('tutup 08.00 WIB', findAirport('WIHH')!)).toContain('08.00 WIB [UTC 0100]');
    expect(buildPrompt('x', findAirport('WIHH')!, retrieve('x', 1)[0]?.freeText)).not.toBe(buildPrompt('x', findAirport('WIHH')!));
  });
});

describe('generator', () => {
  it('mock menandai hasil sebagai mock dan validasi gagal (bukan sukses palsu)', async () => {
    const g = await new RagGenerator(new MockLlm()).generate({ freeText: 'Runway ditutup 3 Maret 2025', airport: 'WIHH' });
    expect(g.provider).toBe('mock');
    expect(g.validation.status).toBe('failed');
  });

  it('provider dipilih eksplisit dari env, tanpa fallback diam-diam', () => {
    expect(providerFromEnv({}).name).toBe('mock');
    expect(() => providerFromEnv({ LLM_PROVIDER: 'anthropic' })).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => providerFromEnv({ LLM_PROVIDER: 'x' })).toThrow(/tidak dikenal/);
    expect(providerFromEnv({ LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k', LLM_MODEL: 'm' }).name).toBe('anthropic');
    expect(() => providerFromEnv({ LLM_PROVIDER: 'ollama' })).toThrow(/LLM_MODEL/);
    expect(providerFromEnv({ LLM_PROVIDER: 'ollama', LLM_MODEL: 'm' }).name).toBe('ollama');
  });

  it('ollama: kirim request yang benar dan buang blok <think>', async () => {
    let body: any;
    const srv = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        body = { url: req.url, ...JSON.parse(raw) };
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ response: '<think>x</think>\nQ) A' }));
      });
    });
    await new Promise<void>((r) => srv.listen(0, r));
    const port = (srv.address() as any).port;
    const out = await new OllamaLlm(`http://127.0.0.1:${port}`, 'qwen3:8b').complete('P');
    srv.close();
    expect(out).toEqual({ text: 'Q) A', model: 'qwen3:8b' });
    expect(body).toMatchObject({ url: '/api/generate', model: 'qwen3:8b', prompt: 'P', stream: false, think: false });
  });
});

describe('koreksi kurung penutup', () => {
  const ap = findAirport('WIHH')!;
  const head = 'Q) WIIF/QMRLC/IV/NBO/A/000/999/0616S10653E005\nA) WIHH\nB) 2611040100\nC) 2611050500\n';
  it('membuang ")" sisa pembungkus ICAO di akhir E)', () => {
    const r = correctNotam(`${head}E) RWY 07/25 CLSD DUE TO VOLCANIC ERUPTION)`, ap, '');
    expect(r.text.endsWith('VOLCANIC ERUPTION')).toBe(true);
    expect(r.corrections).toContain('Tanda kurung ")" berlebih di akhir E) dihapus');
  });
  it('mempertahankan kurung yang berpasangan', () => {
    const r = correctNotam(`${head}E) RWY 07/25 CLSD (WIP)`, ap, '');
    expect(r.text.endsWith('(WIP)')).toBe(true);
    expect(r.corrections).toHaveLength(0);
  });
});

describe('validator kode Q (tabel ICAO Doc 8400)', () => {
  const warns = (t: string) => validateNotam(t, 'WIHH').issues.filter((i) => i.code.startsWith('Q_SUBJECT') || i.code.startsWith('Q_CONDITION'));
  const codes = (t: string) => warns(t).map((i) => i.code);

  it('subjek atau kondisi yang tidak ada di tabel ICAO jadi peringatan, bukan galat', () => {
    expect(codes(GOOD)).toEqual([]);
    expect(codes(GOOD.replace('QMRLC', 'QZZLC'))).toContain('Q_SUBJECT_UNKNOWN');
    expect(codes(GOOD.replace('QMRLC', 'QMRZZ'))).toContain('Q_CONDITION_UNKNOWN');
    expect(validateNotam(GOOD.replace('QMRLC', 'QZZZZ'), 'WIHH').status).toBe('warning');
  });

  it('kode TT (Trigger) dikenal', () => {
    expect(codes(GOOD.replace('QMRLC', 'QMRTT'))).toEqual([]);
  });

  it('subjek harus cocok dengan frasa awal E): APRON harus MN, bukan MX', () => {
    const apron = (q: string) => GOOD.replace('QMRLC', q).replace('RWY 06/24 CLSD DUE TO WIP', 'APRON CLSD DUE TO WIP');
    const bad = warns(apron('QMXLC'));
    expect(bad.map((i) => i.code)).toEqual(['Q_SUBJECT_TEXT']);
    expect(bad[0].message).toContain('MN');
    expect(validateNotam(apron('QMXLC'), 'WIHH').status).toBe('warning');
    expect(codes(apron('QMNLC'))).toEqual([]);
  });

  it('TWY, stand, dan RWY: subjek benar lolos, subjek keliru diperingatkan', () => {
    const e = (q: string, text: string) => GOOD.replace('QMRLC', q).replace('RWY 06/24 CLSD DUE TO WIP', text);
    expect(codes(e('QMXLC', 'TWY D CLSD DUE TO WIP'))).toEqual([]);
    expect(codes(e('QMRLC', 'TWY D CLSD DUE TO WIP'))).toEqual(['Q_SUBJECT_TEXT']);
    expect(codes(e('QMPLC', 'PRKG STAND NR 7 CLSD DUE TO WIP'))).toEqual([]);
    expect(codes(e('QMXLC', 'ACFT STAND NR 7 CLSD DUE TO WIP'))).toEqual(['Q_SUBJECT_TEXT']);
    expect(codes(e('QMXLC', 'RWY 06/24 CLSD DUE TO WIP'))).toEqual(['Q_SUBJECT_TEXT']);
  });

  it('frasa yang subjeknya lain tidak diperingatkan (lampu, marka, arresting gear)', () => {
    const e = (q: string, text: string) => GOOD.replace('QMRLC', q).replace('RWY 06/24 CLSD DUE TO WIP', text);
    expect(codes(e('QLYAS', 'TWY EDGE LGT U/S DUE TO MAINT'))).toEqual([]);
    expect(codes(e('QLEAS', 'RWY EDGE LGT 04/22 U/S'))).toEqual([]);
    expect(codes(e('QMHCS', 'RWY ARRESTING GEAR RWY 18 INSTALLED'))).toEqual([]);
    expect(codes(e('QXXXX', 'APRON LIGHT U/S')).includes('Q_SUBJECT_TEXT')).toBe(false);
  });

  it('NOTAM asli di dataset: hanya QXXXX yang diperingatkan (subjek XX tidak ada di tabel ICAO)', () => {
    const data: { notam: string }[] = JSON.parse(readFileSync(join(__dirname, '..', '..', 'data', 'examples.json'), 'utf8'));
    const flagged = data.filter((x) => warns(x.notam).length);
    expect(flagged.every((x) => /\/QXXXX\//.test(x.notam))).toBe(true);
  });
});

describe('validator alasan (DUE TO harus bersumber dari input)', () => {
  const reason = (t: string, input?: string) => validateNotam(t, 'WIHH', input).issues.filter((i) => i.code === 'REASON_NOT_IN_INPUT');

  it('input hanya menyebut kondisi tetapi E) memuat DUE TO: peringatan, tidak memblokir', () => {
    const r = reason(GOOD, 'Landasan pacu 06/24 ditutup');
    expect(r).toHaveLength(1);
    expect(r[0].level).toBe('warning');
    expect(validateNotam(GOOD, 'WIHH', 'Landasan pacu 06/24 ditutup').status).toBe('warning');
  });

  it('input menyebut alasan (karena, pekerjaan, pemeliharaan, due to) tidak diperingatkan', () => {
    for (const input of ['Landasan pacu 06/24 ditutup karena ada pekerjaan', 'Runway ditutup untuk pemeliharaan', 'diperbaiki', 'RWY closed due to works'])
      expect(reason(GOOD, input)).toEqual([]);
  });

  it('tanpa DUE TO di E), atau DUE TO hanya di RMK, atau tanpa teks input: tidak diperingatkan', () => {
    expect(reason(GOOD.replace(' DUE TO WIP', ''), 'Landasan pacu 06/24 ditutup')).toEqual([]);
    expect(reason(GOOD.replace('DUE TO WIP', 'RMK: AIRCRAFT DUE TO LAND SHOULD DIVERT'), 'Landasan pacu 06/24 ditutup')).toEqual([]);
    expect(reason(GOOD)).toEqual([]);
  });

  it('prompt memuat aturan alasan', () => {
    expect(buildPrompt('Landasan pacu 06/24 ditutup', findAirport('WIHH')!)).toContain('Alasan (DUE TO ...) hanya boleh ditulis bila input menyebut alasannya');
  });

  it('NOTAM asli di dataset: hanya sedikit yang alasannya tidak ada di narasi (18 dari 927 saat diukur)', () => {
    const data: { freeText: string; notam: string }[] = JSON.parse(readFileSync(join(__dirname, '..', '..', 'data', 'examples.json'), 'utf8'));
    const flagged = data.filter((x) => reason(x.notam, x.freeText).length).length;
    expect(flagged > 0 && flagged <= 25).toBe(true);
  });

  describe('Traffic/Purpose/Scope per kode Q', () => {
    it('kombinasi yang lazim untuk kodenya tidak diperingatkan', () => {
      expect(tpsWarnings('WIIX/QFAXX/IV/NBO/A/000/999/0610S10646E005')).toEqual([]);
      expect(tpsWarnings('WIIX/QNMAS/IV/BO/AE/000/999/0610S10646E005')).toEqual([]);
    });
    it('kombinasi yang belum pernah dipakai untuk kode yang sering muncul diperingatkan', () => {
      const w = tpsWarnings('WIIX/QFAXX/IV/BO/W/000/999/0610S10646E005');
      expect(w.map((x) => x.code)).toEqual(['Q_TPS_UNUSUAL']);
      expect(w[0].message).toContain('IV/NBO/A');
    });
    it('kode yang jarang di dataset dibandingkan dengan matriks ICAO, dengan toleransi ketat/longgar', () => {
      // QLGAS: ICAO IV/B. IV/BO lebih longgar (kompatibel), IV/M bertolak belakang.
      expect(tpsWarnings('WIIX/QLGAS/IV/BO/A/000/999/0610S10646E005')).toEqual([]);
      expect(tpsWarnings('WIIX/QLGAS/IV/M/A/000/999/0610S10646E005').map((x) => x.code)).toEqual(['Q_TPS_ICAO']);
    });
    it('kode yang jarang atau belum dikenal di dataset tidak diperingatkan', () => {
      expect(tpsWarnings('WIIX/QZZZZ/IV/BO/W/000/999/0610S10646E005')).toEqual([]);
    });
  });
});


describe('koreksi subjek kode Q dan alasan baku', () => {
  const ap = findAirport('WIHH')!;
  const head = (q: string) => `Q) WIIF/${q}/${q === 'QMRLC' ? 'IV/NBO/A' : 'IV/BO/A'}/000/999/0616S10653E005\nA) WIHH\nB) 2611040100\nC) 2611050500\n`;
  it('subjek yang tidak ada di tabel ICAO diganti subjek yang lazim menurut E)', () => {
    const r = correctNotam(`${head('QTCAS')}E) TAXIWAY EC1 U/S DUE TO SURFACE DAMAGE`, ap, 'Taxiway EC1 tidak dapat digunakan karena rusak');
    // subjek dikoreksi (TC -> MX), lalu area gerak yang tidak dapat digunakan menjadi CLSD dan kondisi AS menjadi LC
    expect(r.text).toContain('WIIF/QMXLC/');
    expect(r.text).toContain('E) TAXIWAY EC1 CLSD DUE TO SURFACE DAMAGE');
    expect(r.corrections).toContain('Subjek kode Q tidak ada di tabel ICAO, diganti sesuai E): QTCAS → QMXAS');
    expect(validateNotam(r.text, 'WIHH', 'Taxiway EC1 tidak dapat digunakan karena rusak').issues.map((i) => i.code)).not.toContain('Q_SUBJECT_UNKNOWN');
  });
  it('subjek tak dikenal tanpa frasa E) yang tegas dibiarkan dan tetap ditandai', () => {
    const r = correctNotam(`${head('QTCAS')}E) AERODROME CLSD`, ap, '');
    expect(r.text).toContain('/QTCAS/');
    expect(validateNotam(r.text, 'WIHH', '').issues.map((i) => i.code)).toContain('Q_SUBJECT_UNKNOWN');
  });
  it('QXXXX (plain language) tidak dianggap subjek tak dikenal', () => {
    const t = `${head('QXXXX')}E) SPECIAL ACTIVITY`;
    expect(correctNotam(t, ap, '').text).toBe(t);
    expect(validateNotam(t, 'WIHH', '').issues.map((i) => i.code)).not.toContain('Q_SUBJECT_UNKNOWN');
  });
  it('Q_SUBJECT_UNKNOWN memblokir submit', () => {
    expect(BLOCKING).toContain('Q_SUBJECT_UNKNOWN');
  });
  it('alasan pemeliharaan disingkat menjadi DUE TO MAINT, RMK tetap utuh', () => {
    const r = correctNotam(`${head('QMRLC')}E) RWY 07/25 CLSD DUE TO MAINTENANCE WORK RMK: ALL TFC CTN ADZ`, ap, 'Runway ditutup karena pemeliharaan rutin');
    expect(r.text).toContain('E) RWY 07/25 CLSD DUE TO MAINT RMK: ALL TFC CTN ADZ');
    expect(r.corrections).toContain('Alasan disingkat sesuai kebiasaan AirNav: DUE TO MAINTENANCE WORK → DUE TO MAINT');
  });
  it('alasan tidak disingkat bila input menyebut kerusakan atau alasan memuat objek tertentu', () => {
    const dmg = `${head('QMRLC')}E) RWY 07/25 CLSD DUE TO MAINTENANCE WORK`;
    expect(correctNotam(dmg, ap, 'ditutup karena kerusakan, setelah pemeliharaan').text).toBe(dmg);
    const obj = `${head('QMRLC')}E) RWY 07/25 CLSD DUE TO MAINTENANCE OF ARRESTING GEAR`;
    expect(correctNotam(obj, ap, 'ditutup karena pemeliharaan arresting gear').text).toBe(obj);
    const already = `${head('QMRLC')}E) RWY 07/25 CLSD DUE TO MAINT`;
    expect(correctNotam(already, ap, 'ditutup karena pemeliharaan').corrections).toEqual([]);
  });
});

describe('area gerak tidak dapat digunakan = CLSD', () => {
  const ap = findAirport('WIHH')!;
  const t = (e: string, q = 'QMRAS') => `Q) WIIF/${q}/IV/NBO/A/000/999/0616S10653E005\nA) WIHH\nB) 2611060100\nC) 2611070500\nE) ${e}`;
  const input = 'Landasan pacu 06/24 tidak bisa dilandasi karena pekerjaan mulai 6 November 2026 pukul 08.00 WIB sampai 7 November 2026 pukul 12.00 WIB';
  it('landasan yang CLSD dari model dibiarkan (tidak dapat digunakan = closed)', () => {
    const t1 = t('RWY 06/24 CLSD DUE TO WIP', 'QMRLC');
    expect(correctNotam(t1, ap, input).text).toBe(t1);
    expect(validateNotam(t1, 'WIHH', input).issues.map((i) => i.code)).not.toContain('CLSD_NOT_IN_INPUT');
  });
  it('U/S pada area gerak diganti CLSD dan kondisi AS menjadi LC', () => {
    const r = correctNotam(t('TWY EC1 U/S DUE TO SURFACE DAMAGE', 'QMXAS'), ap, 'Taxiway EC1 tidak dapat digunakan karena kerusakan');
    expect(r.text).toContain('/QMXLC/');
    expect(r.text).toContain('E) TWY EC1 CLSD DUE TO SURFACE DAMAGE');
    expect(r.corrections.some((c) => c.includes('U/S diganti CLSD'))).toBe(true);
  });
  it('lampu dan peralatan tetap U/S', () => {
    const t1 = t('RWY EDGE LGT RWY 06/24 U/S', 'QLEAS');
    expect(correctNotam(t1, ap, 'lampu tepi landasan tidak dapat digunakan').text).toBe(t1);
  });
  it('input yang menyebut pembatasan tidak diubah', () => {
    const t1 = t('RWY 06/24 U/S DUE TO WIP');
    expect(correctNotam(t1, ap, 'landasan terbatas karena pekerjaan').text).toBe(t1);
  });
  it('tidak menyentuh E) dengan lebih dari satu U/S, dan RMK tetap utuh', () => {
    const t1 = t('RWY 06/24 U/S AND U/S');
    expect(correctNotam(t1, ap, input).text).toBe(t1);
    const r = correctNotam(t('RWY 06/24 U/S DUE TO WIP RMK: ALL TFC CTN ADZ U/S AREA'), ap, input);
    expect(r.text).toContain('E) RWY 06/24 CLSD DUE TO WIP RMK: ALL TFC CTN ADZ U/S AREA');
  });
  it('validator memperingatkan CLSD bila input hanya menyebut pekerjaan', () => {
    const t1 = t('RWY 06/24 CLSD DUE TO WIP', 'QMRLC');
    expect(validateNotam(t1, 'WIHH', 'Landasan pacu 06/24 dilakukan pekerjaan').issues.map((i) => i.code)).toContain('CLSD_NOT_IN_INPUT');
    expect(validateNotam(t1, 'WIHH', 'Landasan pacu 06/24 ditutup karena pekerjaan').issues.map((i) => i.code)).not.toContain('CLSD_NOT_IN_INPUT');
  });

  it('draf runway dengan subjek dan kondisi salah (QLACS, U/S) menjadi QMRLC dan CLSD', () => {
    const r = correctNotam(t('RWY 06/24 U/S TEMPORARILY DUE TO MAINTENANCE', 'QLACS'), ap, 'Landasan pacu 06/24 tidak bisa digunakan sementara');
    expect(r.text).toContain('/QMRLC/');
    expect(r.text).toContain('E) RWY 06/24 CLSD');
    expect(r.text).not.toContain('TEMPORARILY');
    expect(r.text).not.toContain('DUE TO');
    expect(r.corrections.some((c) => c.includes('(LA) tidak cocok dengan E) yang diawali RWY'))).toBe(true);
    expect(r.corrections.some((c) => c.includes('U/S diganti CLSD, kondisi Q CS → LC'))).toBe(true);
  });
  it('CLSD dengan kondisi Q selain LC dikoreksi menjadi LC', () => {
    const r = correctNotam(t('RWY 06/24 CLSD DUE TO WIP', 'QMRCS'), ap, 'Landasan pacu 06/24 ditutup karena pekerjaan');
    expect(r.text).toContain('/QMRLC/');
    expect(r.corrections.some((c) => c.includes('kondisi Q CS → LC'))).toBe(true);
  });
  it('subjek yang bertentangan dengan E) diganti, yang sudah cocok atau tidak tegas dibiarkan', () => {
    expect(correctNotam(t('RWY 06/24 WIP', 'QLAHW'), ap, 'pekerjaan di runway').text).toContain('/QMRHW/');
    const ok = t('RWY 06/24 CLSD DUE TO WIP', 'QMRLC');
    expect(correctNotam(ok, ap, 'ditutup karena pekerjaan').text).toBe(ok);
    const papi = t('PAPI RWY 06/24 U/S', 'QLPAS');
    expect(correctNotam(papi, ap, 'PAPI tidak dapat digunakan').text).toBe(papi);
  });

  describe('alasan yang dikarang model', () => {
    const ap2 = findAirport('WIHH')!;
    const tt = (e: string) => `Q) WIIF/QMRLC/IV/NBO/A/000/999/0616S10653E005\nA) WIHH\nB) 2611060200\nC) 2611070800\nE) ${e}`;
    it('DUE TO dihapus bila input tidak menyebut alasan', () => {
      const r = correctNotam(tt('RWY 06/24 CLSD TEMPORARILY DUE TO MAINTENANCE'), ap2, 'Landasan pacu 06/24 tidak bisa digunakan sementara');
      expect(r.text).toContain('E) RWY 06/24 CLSD');
    expect(r.text).not.toContain('TEMPORARILY');
      expect(r.text).not.toContain('DUE TO');
      expect(r.corrections).toContain('Alasan "DUE TO MAINTENANCE" dihapus karena input tidak menyebut alasan');
    });
    it('RMK tetap utuh setelah alasan dihapus', () => {
      const r = correctNotam(tt('RWY 06/24 CLSD DUE TO MAINTENANCE RMK: ALL TFC CTN ADZ'), ap2, 'Landasan pacu 06/24 ditutup');
      expect(r.text).toContain('E) RWY 06/24 CLSD RMK: ALL TFC CTN ADZ');
    });
    it('alasan dipertahankan bila input menyebutnya, atau bila TECR', () => {
      const a = tt('RWY 06/24 CLSD DUE TO WIP');
      expect(correctNotam(a, ap2, 'Landasan pacu 06/24 ditutup karena pekerjaan').text).toBe(a);
      const b = tt('RWY 06/24 CLSD DUE TO TECR');
      expect(correctNotam(b, ap2, 'Landasan pacu 06/24 ditutup').text).toBe(b);
    });
  });

  describe('kata sementara tidak diterjemahkan', () => {
    const ap3 = findAirport('WIHH')!;
    const tt = (e: string) => `Q) WIIF/QMRLC/IV/NBO/A/000/999/0616S10653E005\nA) WIHH\nB) 2611060200\nC) 2611070800\nE) ${e}`;
    it('TEMPORARILY dan TEMPO dihapus dari E), RMK tetap utuh', () => {
      const r = correctNotam(tt('RWY 06/24 CLSD TEMPORARILY RMK: TEMPORARILY ALL TFC CTN ADZ'), ap3, 'Landasan pacu 06/24 ditutup sementara');
      expect(r.text).toContain('E) RWY 06/24 CLSD RMK: TEMPORARILY ALL TFC CTN ADZ');
      expect(r.corrections.some((c) => c.startsWith('Kata "TEMPORARILY" dihapus'))).toBe(true);
      expect(correctNotam(tt('RWY 06/24 TEMPO CLSD'), ap3, 'ditutup sementara').text).toContain('E) RWY 06/24 CLSD');
    });
    it('TEMPORARY dihapus hanya bila menempel pada status', () => {
      expect(correctNotam(tt('RWY 06/24 CLSD TEMPORARY'), ap3, 'ditutup').text).toContain('E) RWY 06/24 CLSD');
      const ad = tt('TEMPORARY CHANGE OF AD DATA AS FLW : RWY 09/27 LIMITED');
      expect(correctNotam(ad, ap3, 'perubahan data aerodrom').text).toBe(ad);
    });
  });

  describe('petunjuk input untuk CLSD dan WIP', () => {
    const tt = (e: string) => `Q) WIIF/QMRLC/IV/NBO/A/000/999/0616S10653E005\nA) WIHH\nB) 2611060200\nC) 2611070800\nE) ${e}`;
    const codes = (e: string, ft: string) => validateNotam(tt(e), 'WIHH', ft).issues.map((i) => i.code);
    it('"belum bisa digunakan" dan "tidak dapat dipergunakan" dianggap tidak dapat dipakai (CLSD sah)', () => {
      expect(codes('RWY 06/24 CLSD', 'Landasan pacu 06/24 belum bisa digunakan mulai tanggal 6 November 2026')).not.toContain('CLSD_NOT_IN_INPUT');
      expect(codes('RWY 06/24 CLSD', 'Landasan pacu 06/24 tidak dapat dipergunakan')).not.toContain('CLSD_NOT_IN_INPUT');
    });
    it('DUE TO WIP tanpa kata pekerjaan di input diperingatkan', () => {
      expect(codes('RWY 06/24 CLSD DUE TO WIP', 'Landasan pacu 06/24 belum bisa digunakan karena ada pesawat di landasan')).toContain('REASON_WIP_NOT_IN_INPUT');
      expect(codes('RWY 06/24 CLSD DUE TO WIP', 'Landasan pacu 06/24 ditutup karena pengerjaan overlay')).not.toContain('REASON_WIP_NOT_IN_INPUT');
      expect(codes('RWY 06/24 CLSD DUE TO MAINT', 'Landasan pacu 06/24 ditutup karena ada pesawat di landasan')).not.toContain('REASON_WIP_NOT_IN_INPUT');
    });
  });

  describe('zona di salah satu jam berlaku untuk semua jam di narasi', () => {
    const wihh = findAirport('WIHH')!;
    const tt = (b: string, c: string) => `Q) WIIF/QMRLC/IV/NBO/A/000/999/0616S10653E005\nA) WIHH\nB) ${b}\nC) ${c}\nE) RWY 06/24 CLSD DUE TO WIP`;
    const feat = (a: string, b: string) => `Landasan pacu 06/24 ditutup karena pekerjaan mulai tanggal 7 November 2026 pukul ${a} sampai tanggal 8 November 2026 pukul ${b}`;
    it('anotasi: jam tak berlabel ikut zona jam berlabel (mendahului atau mengikuti)', () => {
      expect(annotateLocalTimes('pukul 08.00 WIB sampai pukul 10.00')).toBe('pukul 08.00 WIB [UTC 0100] sampai pukul 10.00 [UTC 0300, zona WIB ikut jam berlabel]');
      expect(annotateLocalTimes('pukul 08.00 sampai pukul 10.00 WITA')).toBe('pukul 08.00 [UTC 0000, zona WITA ikut jam berlabel] sampai pukul 10.00 WITA [UTC 0200]');
    });
    it('tanpa label zona sama sekali, atau berlabel UTC: tidak disentuh (UTC apa adanya)', () => {
      expect(annotateLocalTimes('pukul 08.00 sampai pukul 10.00')).toBe('pukul 08.00 sampai pukul 10.00');
      expect(annotateLocalTimes('pukul 0800 UTC sampai 1000')).toBe('pukul 0800 UTC sampai 1000');
    });
    it('narasi yang memuat jam UTC berlabel: jam tak berlabel tidak diwarisi (UTC dan padanan lokal ditulis berdampingan)', () => {
      expect(annotateLocalTimes('mulai pukul 2300 (08.00 WIT) sampai pukul 1000 UTC')).toBe('mulai pukul 2300 (08.00 WIT [UTC 2300, tanggal -1 hari]) sampai pukul 1000 UTC');
    });
    it('pola "Jam 2300 (08.00 WIT)" (UTC lalu padanan lokal): jam tak berlabel tidak diwarisi', () => {
      expect(annotateLocalTimes('mulai Jam 2300 (08.00 WIT) sampai dengan Jam 0100 (10.00 WIT)')).toBe('mulai Jam 2300 (08.00 WIT [UTC 2300, tanggal -1 hari]) sampai dengan Jam 0100 (10.00 WIT [UTC 0100])');
    });
    it('angka lain (tahun, ketinggian, runway) tidak ikut dikonversi', () => {
      expect(annotateLocalTimes('pukul 08.00 WIB pada 5 Nov 2026, 1500 FT dari RWY 06/24')).toBe('pukul 08.00 WIB [UTC 0100] pada 5 Nov 2026, 1500 FT dari RWY 06/24');
    });
    it('hanya jam akhir berlabel WIB: jam awal ikut WIB, B) dan C) keduanya dikonversi', () => {
      expect(expectedUtcPlan(feat('0800', '1000 WIB'))).toEqual({ B: '2611070100', C: '2611080300' });
      const r = correctNotam(tt('2611070800', '2611081000'), wihh, feat('0800', '1000 WIB'));
      expect(r.text).toContain('B) 2611070100');
      expect(r.text).toContain('C) 2611080300');
    });
    it('hanya jam awal berlabel WIB: jam akhir ikut WIB', () => {
      const r = correctNotam(tt('2611070800', '2611081000'), wihh, feat('0800 WIB', '1000'));
      expect(r.text).toContain('B) 2611070100');
      expect(r.text).toContain('C) 2611080300');
    });
    it('tanpa label zona sama sekali: B) dan C) tidak diubah dan tidak ada galat', () => {
      const n = tt('2611070600', '2611090800');
      expect(correctNotam(n, wihh, feat('0600', '0800')).corrections.filter((c) => /^[BC]\)/.test(c))).toEqual([]);
      expect(validateNotam(n, 'WIHH', feat('0600', '0800')).issues.map((i) => i.code)).not.toContain('B_UTC_MISMATCH');
    });
    it('keduanya berlabel: keduanya dikonversi (perilaku lama)', () => {
      const r = correctNotam(tt('2611070800', '2611081000'), wihh, feat('0800 WIB', '1000 WIB'));
      expect(r.text).toContain('B) 2611070100');
      expect(r.text).toContain('C) 2611080300');
    });
    it('validator: B) yang belum dikonversi untuk jam yang ikut zona dianggap salah', () => {
      const v = validateNotam(tt('2611070800', '2611080300'), 'WIHH', feat('0800', '1000 WIB'));
      expect(v.issues.map((i) => i.code)).toContain('B_UTC_MISMATCH');
    });
  });

  describe('WIP tanpa penutupan = kondisi HW', () => {
    const wihh = findAirport('WIHH')!;
    const nn = (q: string, e: string) => `Q) WIIF/${q}/000/999/0616S10653E005\nA) WIHH\nB) 2611060200\nC) 2611070800\nE) ${e}`;
    it('E) berstatus WIP dengan kondisi LC diganti HW, Traffic/Purpose/Scope ikut ke kombinasi lazim', () => {
      const r = correctNotam(nn('QMRLC/IV/NBO/A', 'RWY 18/36 MARKING REPAINTING WIP'), wihh, 'pengecatan ulang marka landasan, landasan tetap dapat digunakan');
      expect(r.text).toContain('QMRHW/IV/BO/A/');
      expect(r.corrections.join(' ')).toContain('HW');
    });
    it('taxiway: subjek MX memakai kombinasi lazimnya sendiri', () => {
      const r = correctNotam(nn('QMXLC/IV/BO/A', 'TWY OVERLAY WIP'), wihh, 'pekerjaan overlay taxiway');
      expect(r.text).toContain('QMXHW/IV/M/A/');
    });
    it('CLSD, LIMITED, dan alasan "DUE TO WIP" tidak mengubah kondisi', () => {
      for (const e of ['RWY 06/24 CLSD DUE TO WIP', 'RWY 06/24 LIMITED WIP', 'RWY 06/24 CLSD']) {
        expect(correctNotam(nn('QMRLC/IV/NBO/A', e), wihh, 'ditutup karena pekerjaan').text).toContain('QMRLC/IV/NBO/A/');
      }
      expect(correctNotam(nn('QMRLC/IV/NBO/A', 'RWY 06/24 U/S DUE TO WIP'), wihh, 'pekerjaan').text).not.toContain('QMRHW');
    });
    it('kondisi lain yang tidak bertentangan (mis. CM displaced) dibiarkan', () => {
      expect(correctNotam(nn('QMRCM/IV/NBO/A', 'RWY 02/20 DISPLACED WIP'), wihh, 'pekerjaan').text).toContain('QMRCM/IV/NBO/A/');
    });
    it('bukan area gerak (mis. lampu) dan sudah HW dibiarkan', () => {
      expect(correctNotam(nn('QLEAS/IV/BO/A', 'RWY EDGE LGT WIP'), wihh, 'pekerjaan').text).toContain('QLEAS/IV/BO/A/');
      expect(correctNotam(nn('QMRHW/IV/BO/A', 'RWY 06/24 WIP'), wihh, 'pekerjaan').corrections.filter((c) => c.includes('HW'))).toEqual([]);
    });
  });
});

describe('LP vs LA dan tabel NSC (Traffic/Purpose/Scope)', () => {
  const wihh = { icao: 'WIHH' } as never;
  const mk = (q: string, e: string) => `Q) WIIF/${q}/IV/NBO/A/000/999/0616S10653E005\nA) WIHH\nB) 2611040100\nC) 2611050500\nE) ${e}`;
  it('PAPI memakai subjek LP, approach lighting memakai LA', () => {
    expect(correctNotam(mk('QLAAS', 'PAPI RWY 06 U/S'), wihh, 'PAPI runway 06 rusak').text).toContain('/QLPAS/');
    expect(correctNotam(mk('QLPAS', 'APCH LGT RWY 06 U/S'), wihh, 'approach lighting runway 06 rusak').text).toContain('/QLAAS/');
  });
  it('QMRLC memakai purpose NBO sesuai tabel NSC', () => {
    const t = correctNotam(mk('QMRLC', 'RWY 06/24 CLSD').replace('IV/NBO/A', 'IV/BO/A'), wihh, 'runway 06/24 ditutup').text;
    expect(t).toContain('QMRLC/IV/NBO/A/');
  });
});
