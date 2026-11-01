import { readFileSync } from 'fs';
import { join } from 'path';
import { listAirports } from '../master/airports';

// Saran lanjutan kalimat untuk narasi, dipelajari dari pola narasi di dataset (n-gram kata).
// Tidak pernah mengusulkan angka, tanggal, atau kata langka (nama bandara/orang) agar data lama tidak terbawa.

export interface Suggestion { insert: string; label: string }

const MAX_EXTEND = 5;
const MIN_COUNT = 2;
const RARE = 3;

const strip = (w: string) => w.replace(/^[^\p{L}\p{N}/]+|[^\p{L}\p{N}/]+$/gu, '');
const key = (w: string) => strip(w).toLowerCase();
const hasDigit = (w: string) => /\d/.test(w);
const MONTHS = new Set(['januari', 'februari', 'pebruari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'nopember', 'desember', 'january', 'february', 'march', 'may', 'june', 'july', 'august', 'october', 'december']);

// Kata dari nama bandara dan kota di master tidak diusulkan, kecuali kata umum.
const GENERIC = new Set(['bandar', 'udara', 'bandara', 'internasional', 'international', 'airport', 'raya', 'baru', 'lama', 'kota', 'pulau', 'tengah', 'utara', 'selatan', 'barat', 'timur', 'haji', 'raja']);
const placeWords = () => {
  const s = new Set<string>();
  for (const a of listAirports()) for (const w of `${a.name} ${a.city}`.toLowerCase().split(/[^a-z]+/)) if (w.length >= 3 && !GENERIC.has(w)) s.add(w);
  return s;
};

const STOP_AFTER = new Set(['bandara', 'udara', 'bandar', 'nomor', 'nomer', 'frekuensi', 'freq']);
const BLOCK = new Set(['apt', 'sam']);

export class SuggestModel {
  private places = placeWords();
  private next2 = new Map<string, Map<string, number>>();
  private next1 = new Map<string, Map<string, number>>();
  private freq = new Map<string, number>();
  private forms = new Map<string, Map<string, number>>();

  constructor(texts: string[]) {
    for (const t of texts) {
      for (const sentence of t.split(/[.\n;:]+/)) {
        const words = sentence.split(/\s+/).map(strip).filter(Boolean);
        words.forEach((w, i) => {
          const k = w.toLowerCase();
          this.freq.set(k, (this.freq.get(k) ?? 0) + 1);
          const f = this.forms.get(k) ?? new Map<string, number>();
          f.set(w, (f.get(w) ?? 0) + 1);
          this.forms.set(k, f);
          if (i >= 1) this.bump(this.next1, words[i - 1].toLowerCase(), k);
          if (i >= 2) this.bump(this.next2, `${words[i - 2].toLowerCase()} ${words[i - 1].toLowerCase()}`, k);
        });
      }
    }
  }

  private bump(m: Map<string, Map<string, number>>, ctx: string, w: string) {
    const c = m.get(ctx) ?? new Map<string, number>();
    c.set(w, (c.get(w) ?? 0) + 1);
    m.set(ctx, c);
  }

  // Kata yang aman diusulkan: bukan angka/tanggal, bukan nama bulan, dan cukup sering muncul.
  private ok(w: string) {
    if (w.length < 2 || hasDigit(w) || MONTHS.has(w) || BLOCK.has(w) || (this.freq.get(w) ?? 0) < RARE) return false;
    const d = this.display(w); // kode pendek berhuruf kapital yang jarang (mis. identitas NDB) tidak diusulkan
    if (d === d.toUpperCase() && w.length <= 5 && (this.freq.get(w) ?? 0) < 10) return false;
    return !w.split(/[-/]/).some((x) => this.places.has(x));
  }

  // Bentuk tulisan yang paling umum; utamakan huruf kecil/campuran daripada SEMUA KAPITAL kecuali singkatan.
  private display(k: string) {
    const f = [...(this.forms.get(k) ?? new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]);
    const mixed = f.find(([w]) => w !== w.toUpperCase());
    const caps = f.find(([w]) => w === w.toUpperCase());
    if (caps && (!mixed || (caps[1] > 3 * mixed[1] && k.length <= 5))) return caps[0];
    return mixed?.[0] ?? k;
  }

  private candidates(prev2: string | null, prev1: string | null) {
    const m = (prev2 && this.next2.get(prev2)) || (prev1 && this.next1.get(prev1)) || null;
    return m ? [...m.entries()].sort((a, b) => b[1] - a[1]) : [];
  }

  private extend(a: string, b: string) {
    const out: string[] = [];
    let p2 = a, p1 = b;
    for (let i = 0; i < MAX_EXTEND; i++) {
      if (STOP_AFTER.has(p1)) break; // setelah "bandara" biasanya nama bandara: biarkan pengguna yang menulis
      const best = this.candidates(`${p2} ${p1}`, null).find(([w, n]) => n >= MIN_COUNT && this.ok(w) && w !== p1);
      if (!best) break;
      out.push(best[0]);
      [p2, p1] = [p1, best[0]];
    }
    return out;
  }

  suggest(text: string, limit = 3): Suggestion[] {
    const endsWithSpace = /\s$/.test(text);
    const words = text.split(/\s+/).filter(Boolean);
    const partial = endsWithSpace ? '' : key(words[words.length - 1] ?? '');
    const ctx = (endsWithSpace ? words : words.slice(0, -1)).map(key).filter(Boolean);
    if (!ctx.length && partial.length < 2) return [];
    const p1 = ctx[ctx.length - 1] ?? null, p2 = ctx.length >= 2 ? `${ctx[ctx.length - 2]} ${p1}` : null;

    let first = this.candidates(p2, p1).filter(([w, n]) => n >= MIN_COUNT && this.ok(w) && (!partial || (w.startsWith(partial) && w !== partial)));
    if (p1 && STOP_AFTER.has(p1)) first = first.filter(([w]) => GENERIC.has(w) || w === 'intl');
    if (!first.length && partial.length >= 2) first = [...this.freq.entries()].filter(([w, n]) => n >= 5 && w.startsWith(partial) && w !== partial && this.ok(w)).sort((a, b) => b[1] - a[1]);

    const out: Suggestion[] = [];
    const seen = new Set<string>();
    for (const [w] of first) {
      const rest = this.extend(p1 ?? '', w);
      const phrase = [w, ...rest].map((x) => this.display(x));
      const label = phrase.join(' ');
      if (seen.has(label.toLowerCase())) continue;
      seen.add(label.toLowerCase());
      const head = phrase[0].slice(partial.length);
      const insert = (endsWithSpace || !words.length ? '' : '') + head + (phrase.length > 1 ? ' ' + phrase.slice(1).join(' ') : '') + ' ';
      out.push({ insert, label });
      if (out.length >= limit) break;
    }
    return out;
  }
}

let model: SuggestModel | null = null;
export function getModel() {
  if (!model) {
    const ex: { freeText: string }[] = JSON.parse(readFileSync(join(__dirname, '..', '..', 'data', 'examples.json'), 'utf8'));
    model = new SuggestModel(ex.map((e) => e.freeText));
  }
  return model;
}
