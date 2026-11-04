// Membuat dataset fine-tuning dari data/examples.json. Tidak mengubah aplikasi.
// Pakai: npx ts-node --transpile-only finetune/build-dataset.ts [--val 0.15] [--seed 7]
// Keluaran di finetune/out/: train.jsonl, val.jsonl, val-cases.json, report.md
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { buildPrompt, Example } from '../src/generator/rag';
import { correctNotam } from '../src/generator/generator';
import { parseItems, validateNotam } from '../src/generator/validator';
import { findAirport } from '../src/master/airports';

const arg = (k: string, d: number) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const VAL = arg('val', 0.15), SEED = arg('seed', 7);
const root = join(__dirname, '..'), out = join(__dirname, 'out');
mkdirSync(out, { recursive: true });

const all: Example[] = JSON.parse(readFileSync(join(root, 'data', 'examples.json'), 'utf8'));
const problems: { kategori: string; tingkat: string; narasi: string }[] = JSON.parse(readFileSync(join(__dirname, 'problem-rows.json'), 'utf8'));

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
// Baris yang oleh pemeriksaan data AirNav ditandai berat (tanggal narasi beda, bandara lain, format tidak valid, kosong): label tidak dipercaya.
const SERIOUS = new Set(['Tanggal mulai narasi beda dengan B)', 'Tanggal selesai narasi beda dengan C)', 'Narasi menyebut bandara lain', 'Format NOTAM tidak valid', 'Data kosong', 'Kolom a beda dengan A)', 'Kolom b beda dengan B)', 'FIR di Q) beda dengan master']);
const bad = problems.filter((p) => SERIOUS.has(p.kategori)).map((p) => norm(p.narasi).slice(0, 80));
const flagged = (t: string) => bad.some((b) => b && norm(t).startsWith(b.slice(0, Math.min(b.length, 60))));

const dropped: Record<string, number> = {};
const drop = (why: string) => (dropped[why] = (dropped[why] ?? 0) + 1);
let changedByRules = 0;
const kept: (Example & { locId: string })[] = [];
for (const e of all) {
  const it = parseItems(e.notam);
  const ap = findAirport(it.A ?? '');
  if (!e.freeText?.trim()) { drop('free_text kosong'); continue; }
  if (!ap) { drop('A) bukan bandara di master'); continue; }
  if (flagged(e.freeText)) { drop('ditandai berat di Daftar Data Bermasalah'); continue; }
  // Terapkan koreksi baku aplikasi pada label (FIR dari master, CLSD, tanpa TEMPORARILY, tanpa alasan karangan) agar model belajar konvensi AirNav terbaru.
  const fixed = correctNotam(e.notam.replace(/\r/g, '').trim(), ap, e.freeText);
  if (fixed.text !== e.notam.replace(/\r/g, '').trim()) changedByRules++;
  const v = validateNotam(fixed.text, ap.locId, e.freeText);
  const errs = v.issues.filter((i) => i.level === 'error');
  if (errs.length) { drop(`label masih error: ${errs[0].code}`); continue; }
  kept.push({ freeText: e.freeText.trim(), notam: fixed.text, locId: ap.locId });
}

// Kelompokkan hampir-duplikat (Jaccard unigram >= 0.8) supaya satu kelompok tidak terbagi ke latih dan uji.
const tok = (s: string) => new Set(norm(s).match(/[a-z]+/g) ?? []);
const T = kept.map((e) => tok(e.freeText));
const parent = kept.map((_, i) => i);
const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
for (let i = 0; i < kept.length; i++)
  for (let j = i + 1; j < kept.length; j++) {
    let h = 0; for (const x of T[i]) if (T[j].has(x)) h++;
    if (h / (T[i].size + T[j].size - h || 1) >= 0.8) parent[find(j)] = find(i);
  }
const groups = new Map<number, number[]>();
kept.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));

let s = SEED;
const rnd = () => ((s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const order = [...groups.values()].map((g) => ({ g, k: rnd() })).sort((a, b) => a.k - b.k).map((x) => x.g);
const valIdx = new Set<number>();
for (const g of order) { if (valIdx.size >= kept.length * VAL) break; g.forEach((i) => valIdx.add(i)); }
const train = kept.filter((_, i) => !valIdx.has(i)), val = kept.filter((_, i) => valIdx.has(i));

const row = (e: Example & { locId: string }, pool: Example[], excludeSelf: boolean) => {
  const prompt = buildPrompt(e.freeText, findAirport(e.locId)!, excludeSelf ? e.freeText : undefined, pool);
  return { messages: [{ role: 'user', content: prompt }, { role: 'assistant', content: e.notam }] };
};
// Retrieval hanya dari data latih; contoh latih tidak melihat dirinya sendiri.
writeFileSync(join(out, 'train.jsonl'), train.map((e) => JSON.stringify(row(e, train, true))).join('\n') + '\n');
writeFileSync(join(out, 'val.jsonl'), val.map((e) => JSON.stringify(row(e, train, false))).join('\n') + '\n');
writeFileSync(join(out, 'train-cases.json'), JSON.stringify(train.map((e) => ({ freeText: e.freeText, airport: e.locId, gold: e.notam })), null, 1));
writeFileSync(join(out, 'val-cases.json'), JSON.stringify(val.map((e) => ({ freeText: e.freeText, airport: e.locId, gold: e.notam })), null, 1));

// Cek kebocoran: tidak ada teks val yang sama persis dengan teks latih.
const trainSet = new Set(train.map((e) => norm(e.freeText)));
const leak = val.filter((e) => trainSet.has(norm(e.freeText))).length;
const lens = train.map((e) => buildPrompt(e.freeText, findAirport(e.locId)!, e.freeText, train).length);
const report = [
  '# Laporan dataset fine-tuning', '',
  `- Contoh asal: ${all.length}`, `- Dipakai: ${kept.length} (latih ${train.length}, uji ${val.length}; ${groups.size} kelompok mirip)`,
  `- Label yang diubah koreksi baku aplikasi: ${changedByRules}`, `- Kebocoran teks identik latih→uji: ${leak}`,
  `- Panjang prompt rata-rata ${Math.round(lens.reduce((a, b) => a + b, 0) / lens.length)} karakter (maks ${Math.max(...lens)})`, '',
  '## Dibuang', ...Object.entries(dropped).map(([k, v]) => `- ${k}: ${v}`),
].join('\n');
writeFileSync(join(out, 'report.md'), report + '\n');
console.log(report);
