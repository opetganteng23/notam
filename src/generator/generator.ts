import { Airport, findAirport } from '../master/airports';
import { buildPrompt } from './rag';
import { expectedUtcStamps } from '../master/time';
import { ICAO_SUBJECT, textSubject } from '../master/icao-qcode';
import { Validation, parseItems, validateNotam } from './validator';

export interface GeneratedNotam {
  text: string;
  corrections: string[];
  provider: string;
  model: string;
  validation: Validation;
}

export interface NotamGenerator {
  generate(input: { freeText: string; airport: string; excludeExample?: string }): Promise<GeneratedNotam>;
}

export const NOTAM_GENERATOR = 'NOTAM_GENERATOR';

export interface LlmProvider {
  name: string;
  complete(prompt: string): Promise<{ text: string; model: string }>;
}

// Tanpa LLM sungguhan: tidak menghasilkan NOTAM, hanya menandai bahwa ini mock.
export class MockLlm implements LlmProvider {
  name = 'mock';
  async complete(prompt: string) {
    const input = /Input:\n([\s\S]*?)\n\nNOTAM:$/.exec(prompt)?.[1] ?? '';
    return { text: `[MOCK] ${input}`, model: 'mock-0' };
  }
}

export class AnthropicLlm implements LlmProvider {
  name = 'anthropic';
  constructor(private apiKey: string, private model: string) {}
  async complete(prompt: string) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: this.model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`LLM provider error ${res.status}`);
    const data = (await res.json()) as { content: { type: string; text?: string }[] };
    return { text: data.content.filter((c) => c.type === 'text').map((c) => c.text).join(''), model: this.model };
  }
}

// LLM lokal via Ollama (data tidak keluar dari server). `think:false` mematikan mode berpikir model yang mendukungnya.
export class OllamaLlm implements LlmProvider {
  name = 'ollama';
  constructor(private baseUrl: string, private model: string) {}
  async complete(prompt: string) {
    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt, stream: false, think: false, options: { temperature: 0 } }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) throw new Error(`LLM provider error ${res.status}`);
    const data = (await res.json()) as { response?: string };
    return { text: (data.response ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim(), model: this.model };
  }
}

// LLM_PROVIDER=mock (default) | anthropic (butuh ANTHROPIC_API_KEY dan LLM_MODEL) | ollama (butuh LLM_MODEL; OLLAMA_URL default http://localhost:11434). Tidak ada fallback diam-diam.
export function providerFromEnv(env: NodeJS.ProcessEnv = process.env): LlmProvider {
  if ((env.LLM_PROVIDER ?? 'mock') === 'mock') return new MockLlm();
  if (env.LLM_PROVIDER === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY || !env.LLM_MODEL) throw new Error('ANTHROPIC_API_KEY dan LLM_MODEL wajib diset');
    return new AnthropicLlm(env.ANTHROPIC_API_KEY, env.LLM_MODEL);
  }
  if (env.LLM_PROVIDER === 'ollama') {
    if (!env.LLM_MODEL) throw new Error('LLM_MODEL wajib diset');
    return new OllamaLlm(env.OLLAMA_URL ?? 'http://localhost:11434', env.LLM_MODEL);
  }
  throw new Error(`LLM_PROVIDER tidak dikenal: ${env.LLM_PROVIDER}`);
}

// Koreksi deterministik atas keluaran LLM: FIR di Q) dari master bandara, B)/C) dari konversi UTC jam berlabel zona di input.
// Setiap koreksi dicatat agar tidak ada perubahan diam-diam.
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const human = (s: string) => `${s.slice(4, 6)} ${MON[+s.slice(2, 4) - 1]} 20${s.slice(0, 2)} ${s.slice(6, 8)}.${s.slice(8, 10)}`;
const shift = (tz: string) => ({ WIB: 'dikurangi 7 jam', WITA: 'dikurangi 8 jam', WIT: 'dikurangi 9 jam' } as Record<string, string>)[tz] ?? 'dikonversi';

export function correctNotam(text: string, airport: Airport, freeText: string): { text: string; corrections: string[] } {
  const items = parseItems(text);
  const corrections: string[] = [];
  const setItem = (key: string, from: string, to: string, label: string) => {
    let done = false;
    text = text
      .split('\n')
      .map((line) => {
        if (done || !line.trimStart().startsWith(`${key})`)) return line;
        done = true;
        return line.replace(from, to);
      })
      .join('\n');
    corrections.push(label.includes('{to}') ? label.replace('{to}', to) : `${label}: ${from} → ${to}`);
  };
  // Sisa kurung penutup pembungkus format ICAO "(... E) ...)" yang tertiru dari dataset.
  const e = items.E ?? '';
  if (e.endsWith(')') && text.trimEnd().endsWith(')') && (e.match(/\(/g) ?? []).length < (e.match(/\)/g) ?? []).length) {
    text = text.trimEnd().slice(0, -1).trimEnd();
    corrections.push('Tanda kurung ")" berlebih di akhir E) dihapus');
  }
  const [fir, ...rest] = (items.Q ?? '').split('/');
  if (rest.length && fir !== airport.fir) setItem('Q', fir, airport.fir, 'FIR di Q) disamakan dengan master bandara');
  // Subjek kode Q yang tidak ada di tabel ICAO diganti subjek yang lazim menurut frasa awal E) bila frasanya tegas (mis. TAXIWAY -> MX).
  const qc = (items.Q ?? '').split('/')[1] ?? '';
  if (/^Q[A-Z]{4}$/.test(qc) && !ICAO_SUBJECT[qc.slice(1, 3)] && qc.slice(1, 3) !== 'XX') {
    const rule = textSubject(items.E);
    if (rule) setItem('Q', qc, `Q${rule.subjects[0]}${qc.slice(3)}`, 'Subjek kode Q tidak ada di tabel ICAO, diganti sesuai E)');
  }
  const exp = expectedUtcStamps(freeText);
  const tz = /\bWITA\b/i.test(freeText) ? 'WITA' : /\bWIT\b/i.test(freeText) ? 'WIT' : /\bWIB\b/i.test(freeText) ? 'WIB' : 'lokal';
  if (exp.length) {
    if (/^\d{10}$/.test(items.B ?? '') && items.B !== exp[0]) setItem('B', items.B, exp[0], `B) ditulis dalam UTC: {to} = ${human(exp[0])} UTC (jam ${tz} di narasi ${shift(tz)})`);
    const cEnd = exp[exp.length - 1];
    const c = items.C?.match(/^(\d{10})( ?EST)?$/);
    if (exp.length > 1 && c && c[1] !== cEnd) setItem('C', c[1], cEnd, `C) ditulis dalam UTC: {to} = ${human(cEnd)} UTC (jam ${tz} di narasi ${shift(tz)})`);
  }
  const maint = shortenMaintenance(text, freeText);
  if (maint) {
    text = maint.text;
    corrections.push(`Alasan disingkat sesuai kebiasaan AirNav: ${maint.from} → DUE TO MAINT`);
  }
  return { text, corrections };
}

// Alasan pemeliharaan di E) ditulis "DUE TO MAINT" (kebiasaan AirNav: 71 NOTAM di dataset), bukan kalimat panjang.
// Hanya bila input menyebut pemeliharaan/perawatan, tidak menyebut kerusakan, dan seluruh kata alasannya kosakata pemeliharaan umum;
// alasan yang memuat objek tertentu (mis. MAINTENANCE OF ILS ANTENNA) dibiarkan.
const MAINT_INPUT = /pelihara|pemelihara|dipelihara|perawat|dirawat|maintenance|maintain|servis/i;
const DAMAGE_INPUT = /rusak|kerusakan|damage|lubang|pothole|retak|crack/i;
const MAINT_WORDS = new Set(['MAINTENANCE', 'MAINT', 'WORK', 'WORKS', 'ACTIVITY', 'ACTIVITIES', 'ROUTINE', 'SCHEDULED', 'PERIODIC', 'PREVENTIVE', 'PROGRAM', 'AND', 'SERVICING', 'SERVICE']);
function shortenMaintenance(text: string, freeText: string): { text: string; from: string } | null {
  if (!MAINT_INPUT.test(freeText) || DAMAGE_INPUT.test(freeText)) return null;
  const rmk = text.search(/\bRMK\b/);
  const head = rmk < 0 ? text : text.slice(0, rmk);
  const m = /\bDUE TO ([A-Z ]+?)(?=\s*(?:[^A-Z ]|$))/.exec(head);
  if (!m) return null;
  const words = m[1].trim().split(/\s+/);
  if (words.join(' ') === 'MAINT' || !words.every((w) => MAINT_WORDS.has(w))) return null;
  return { text: head.slice(0, m.index) + 'DUE TO MAINT' + head.slice(m.index + m[0].length) + (rmk < 0 ? '' : text.slice(rmk)), from: m[0] };
}

// Retrieval dataset -> prompt -> LLM -> koreksi deterministik -> validasi deterministik. Hasil validasi disimpan terpisah dari teks LLM.
export class RagGenerator implements NotamGenerator {
  constructor(private llm: LlmProvider) {}
  async generate({ freeText, airport, excludeExample }: { freeText: string; airport: string; excludeExample?: string }): Promise<GeneratedNotam> {
    const ap = findAirport(airport) as Airport;
    const raw = await this.llm.complete(buildPrompt(freeText, ap, excludeExample));
    const { text, corrections } = correctNotam(raw.text, ap, freeText);
    return { text, corrections, provider: this.llm.name, model: raw.model, validation: validateNotam(text, airport, freeText) };
  }
}
