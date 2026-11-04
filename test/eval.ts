// Evaluasi manual generator terhadap dataset (bukan bagian `npm test`; butuh LLM sungguhan).
// Pakai: LLM_PROVIDER=ollama LLM_MODEL=qwen3:8b npx ts-node --transpile-only test/eval.ts [jumlah=30]
// Contoh yang diuji dikeluarkan dari retrieval agar tidak bocor ke prompt.
import { RagGenerator, providerFromEnv } from '../src/generator/generator';
import { parseItems } from '../src/generator/validator';
import { findAirport } from '../src/master/airports';
import examples from '../data/examples.json';

const n = Number(process.argv[2] ?? 30);
let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
// EVAL_SET=finetune/out/val-cases.json: uji pada set uji fine-tuning (gold sudah dibersihkan). Catatan: retrieval aplikasi tetap memakai seluruh dataset, jadi hasil sedikit optimistis.
import { readFileSync } from 'fs';
const fromSet = process.env.EVAL_SET ? (JSON.parse(readFileSync(process.env.EVAL_SET, 'utf8')) as { freeText: string; gold: string }[]).map((c) => ({ freeText: c.freeText, notam: c.gold })) : null;
const pool = (fromSet ?? (examples as { freeText: string; notam: string }[])).filter((e) => findAirport(parseItems(e.notam).A ?? ''));
const sample = pool.map((e) => ({ e, k: rnd() })).sort((a, b) => a.k - b.k).slice(0, n).map((x) => x.e);

(async () => {
  const gen = new RagGenerator(providerFromEnv());
  const status: Record<string, number> = {};
  const match = { Q: 0, A: 0, B: 0, C: 0 };
  const issues: Record<string, number> = {};
  let corrected = 0;
  const qErr: Record<string, number> = {};
  const qMiss: string[] = [];
  const t0 = Date.now();
  for (const e of sample) {
    const gold = parseItems(e.notam);
    const r = await gen.generate({ freeText: e.freeText, airport: gold.A, excludeExample: e.freeText });
    const out = parseItems(r.text);
    status[r.validation.status] = (status[r.validation.status] ?? 0) + 1;
    for (const i of r.validation.issues) issues[i.code] = (issues[i.code] ?? 0) + 1;
    if (r.corrections.length) corrected++;
    for (const k of ['A', 'B', 'C'] as const) if (out[k]?.replace(/ ?EST$/, '') === gold[k]?.replace(/ ?EST$/, '')) match[k]++;
    const gq = gold.Q?.split('/')[1] ?? '', oq = out.Q?.split('/')[1] ?? '';
    if (oq === gq) match.Q++;
    else {
      const sj = oq.slice(1, 3) !== gq.slice(1, 3), cd = oq.slice(3, 5) !== gq.slice(3, 5);
      const kind = !oq ? 'Q tidak terbaca' : sj && cd ? 'subjek dan kondisi' : sj ? 'hanya subjek' : 'hanya kondisi';
      qErr[kind] = (qErr[kind] ?? 0) + 1;
      qMiss.push(`${gq} -> ${oq || '(kosong)'} [${kind}] E) ${(gold.E ?? '').replace(/\s+/g, ' ').slice(0, 70)}`);
    }
  }
  // Rentang 95% (Wilson) untuk kecocokan Q: sampel kecil memberi rentang lebar.
  const wilson = (k: number, m: number) => { const z = 1.96, p = k / m, d = 1 + (z * z) / m, c = p + (z * z) / (2 * m), w = z * Math.sqrt((p * (1 - p)) / m + (z * z) / (4 * m * m)); return [Math.round(((c - w) / d) * 100), Math.round(((c + w) / d) * 100)]; };
  console.log(JSON.stringify({ n: sample.length, secPerItem: +((Date.now() - t0) / 1000 / sample.length).toFixed(1), status, itemsMatchGold: match, qMatchPct: Math.round((match.Q / sample.length) * 100), qCI95pct: wilson(match.Q, sample.length), qErrors: qErr, qMisses: qMiss, correctedBySystem: corrected, issues }, null, 1));
})();
