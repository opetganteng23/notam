import { createServer } from 'http';
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
  const input = 'ditutup tanggal 01 November 2024 pukul 08.00 WIB sampai tanggal 02 November 2024 pukul 12.00 WIB';
  const codes = (t: string) => validateNotam(t, 'WIHH', input).issues.map((i) => i.code);
  it('menerima B/C hasil konversi UTC dan menolak jam lokal yang tidak dikonversi', () => {
    expect(codes(GOOD.replace('2411011700', '2411010100').replace('2411020500', '2411020500'))).toEqual([]);
    expect(codes(GOOD)).toEqual(expect.arrayContaining(['B_UTC_MISMATCH']));
    expect(codes(GOOD.replace('2411011700', '2411010800').replace('2411020500', '2411021200'))).toEqual(['B_UTC_MISMATCH', 'C_UTC_MISMATCH']);
  });
  it('jam tanpa label zona tidak diperiksa', () => {
    const t = (n: string) => validateNotam(GOOD, 'WIHH', n).status;
    expect(t('tanggal 01 November 2024 pukul 17.00 sampai tanggal 02 November 2024 pukul 05.00')).toBe('passed');
  });
  it('tanggal tidak terbaca di input -> tidak diperiksa', () => {
    expect(validateNotam(GOOD, 'WIHH', 'runway ditutup').status).toBe('passed');
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
    expect(codes(GOOD, 'ditutup setiap hari pukul 15.00 sampai 19.15')).toEqual(['D_MISSING']);
    expect(codes(withD('DAILY 1500-1915'), 'ditutup setiap hari pukul 15.00 sampai 19.15')).toEqual([]);
  });
  it('RMK harus berisi teks dan muncul bila input punya Catatan', () => {
    expect(codes(GOOD + ' RMK: ALL ACFT CTN')).toEqual([]);
    expect(codes(GOOD + ' RMK:')).toEqual(['RMK_EMPTY']);
    expect(codes(GOOD, 'runway ditutup. Catatan: semua pesawat berhati-hati')).toEqual(['RMK_MISSING']);
    expect(codes(GOOD + ' RMK : ALL ACFT CTN', 'Catatan: semua pesawat berhati-hati')).toEqual([]);
  });
});

describe('koreksi deterministik', () => {
  const input = 'ditutup tanggal 01 November 2024 pukul 08.00 WIB sampai tanggal 02 November 2024 pukul 12.00 WIB';
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
