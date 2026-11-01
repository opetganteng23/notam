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
const pool = (examples as { freeText: string; notam: string }[]).filter((e) => findAirport(parseItems(e.notam).A ?? ''));
const sample = pool.map((e) => ({ e, k: rnd() })).sort((a, b) => a.k - b.k).slice(0, n).map((x) => x.e);

(async () => {
  const gen = new RagGenerator(providerFromEnv());
  const status: Record<string, number> = {};
  const match = { Q: 0, A: 0, B: 0, C: 0 };
  const issues: Record<string, number> = {};
  let corrected = 0;
  const t0 = Date.now();
  for (const e of sample) {
    const gold = parseItems(e.notam);
    const r = await gen.generate({ freeText: e.freeText, airport: gold.A, excludeExample: e.freeText });
    const out = parseItems(r.text);
    status[r.validation.status] = (status[r.validation.status] ?? 0) + 1;
    for (const i of r.validation.issues) issues[i.code] = (issues[i.code] ?? 0) + 1;
    if (r.corrections.length) corrected++;
    for (const k of ['A', 'B', 'C'] as const) if (out[k]?.replace(/ ?EST$/, '') === gold[k]?.replace(/ ?EST$/, '')) match[k]++;
    if (out.Q?.split('/')[1] === gold.Q?.split('/')[1]) match.Q++;
  }
  console.log(JSON.stringify({ n: sample.length, secPerItem: +((Date.now() - t0) / 1000 / sample.length).toFixed(1), status, itemsMatchGold: match, correctedBySystem: corrected, issues }, null, 1));
})();
