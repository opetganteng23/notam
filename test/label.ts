// Pelabelan otomatis (draf untuk ditinjau manusia). Pakai: npx ts-node --transpile-only test/label.ts <keluaran.jsonl> [masukan.json]
// Masukan: array {freeText}; bawaan data/examples.json. Keluaran: satu JSON per baris {freeText, labelled, entities}.
import { readFileSync, writeFileSync } from 'fs';
import { labelNarrative } from '../src/labelling/labeller';

const [out, inp = 'data/examples.json'] = process.argv.slice(2);
if (!out) throw new Error('Pakai: label.ts <keluaran.jsonl> [masukan.json]');
const rows: { freeText: string }[] = JSON.parse(readFileSync(inp, 'utf8'));
const count: Record<string, number> = {};
const lines = rows.map((r) => {
  const l = labelNarrative(r.freeText);
  for (const l2 of new Set(l.entities.map((e) => e.label))) count[l2] = (count[l2] || 0) + 1;
  return JSON.stringify({ freeText: r.freeText, ...l });
});
writeFileSync(out, lines.join('\n') + '\n');
console.log(`${rows.length} narasi dilabeli -> ${out}\nnarasi yang memuat label:`, count);
