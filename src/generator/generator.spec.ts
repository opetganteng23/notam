import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join } from 'path';
import { RagGenerator, MockLlm, OllamaLlm, correctNotam, providerFromEnv } from './generator';
import { buildPrompt, retrieve } from './rag';
import { findAirport, mentionedLocators, tzOf } from '../master/airports';
import { annotateLocalTimes } from '../master/time';
import { validateNotam } from './validator';

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
    expect(t('tanggal 01 November 2024 pukul 17.00 sampai tanggal 02 November 2024 pukul 05.00 karena pekerjaan')).toBe('passed');
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
    expect(codes(GOOD + ' RMK : ALL ACFT CTN', 'Catatan: semua pesawat berhati-hati karena pekerjaan')).toEqual([]);
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
    expect(correctNotam(GOOD, findAirport('WIHH')!, 'runway ditutup')).toEqual({ text: GOOD, corrections: [] });
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
});

