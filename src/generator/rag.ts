import { readFileSync } from 'fs';
import { join } from 'path';
import { Airport, tzOf, validArp } from '../master/airports';
import { annotateLocalTimes } from '../master/time';

export interface Example {
  freeText: string;
  notam: string;
}

const examples: Example[] = JSON.parse(readFileSync(join(__dirname, '..', '..', 'data', 'examples.json'), 'utf8'));

const tokens = (s: string) => s.toLowerCase().match(/[a-z0-9/]+/g) ?? [];
const grams = (s: string) => {
  const t = tokens(s);
  return new Set([...t, ...t.slice(1).map((w, i) => `${t[i]} ${w}`)]); // unigram + bigram
};
const indexed = examples.map((e) => ({ e, g: grams(e.freeText) }));

// Contoh paling mirip dari dataset (Jaccard unigram+bigram). Kandidat referensi, bukan bukti kebenaran.
// exclude: teks contoh yang dilewati (dipakai evaluasi agar contoh uji tidak bocor ke prompt).
export function retrieve(freeText: string, k = 3, exclude?: string): Example[] {
  const q = grams(freeText);
  return indexed
    .filter(({ e }) => e.freeText !== exclude)
    .map(({ e, g }) => {
      let hit = 0;
      for (const x of q) if (g.has(x)) hit++;
      return { e, score: hit / (q.size + g.size - hit || 1) };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((r) => r.e);
}

export function buildPrompt(freeText: string, airport: Airport, exclude?: string): string {
  const tz = tzOf(airport);
  const input = annotateLocalTimes(freeText);
  const shots = retrieve(freeText, 3, exclude)
    .map((e, i) => `Contoh ${i + 1}\nInput: ${e.freeText}\nNOTAM:\n${e.notam}`)
    .join('\n\n');
  return [
    'Anda asisten penyusun draf NOTAM. Ubah teks bebas menjadi NOTAM berformat ICAO (item Q, A, B, C, D, E).',
    'Aturan: gunakan hanya informasi pada input dan konteks; jangan mengarang. Jika informasi tidak cukup, tulis item itu sebagai "TIDAK DAPAT DITENTUKAN". Waktu B)/C) dalam UTC format YYMMDDHHMM; jam berlabel WIB/WITA/WIT sudah dikonversi sistem: pakai nilai pada anotasi [UTC ...] ("tanggal -1 hari" berarti mundurkan tanggal sehari); jam tanpa label zona tulis apa adanya. Alasan (DUE TO ...) hanya boleh ditulis bila input menyebut alasannya; bila input hanya menyebut kondisi (mis. ditutup), tulis kondisi saja tanpa DUE TO.',
    `Konteks bandara: LocId ${airport.locId}; nama ${airport.name}; kota ${airport.city}; FIR ${airport.fir}; ARP ${validArp(airport) ?? 'tidak tersedia'}; zona waktu lokal ${tz ? `${tz.label} (UTC+${tz.offset})` : 'tidak diketahui'}.`,
    shots ? `Contoh dari dataset (referensi gaya, bukan fakta untuk input ini):\n\n${shots}` : '',
    `Input:\n${input}\n\nNOTAM:`,
  ]
    .filter(Boolean)
    .join('\n\n');
}
