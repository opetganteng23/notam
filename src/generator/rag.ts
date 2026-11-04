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
// pool: kumpulan contoh alternatif (dipakai pembuatan dataset fine-tuning agar retrieval hanya dari data latih).
const poolIndex = new WeakMap<Example[], { e: Example; g: Set<string> }[]>();
const indexOf = (pool?: Example[]) => {
  if (!pool) return indexed;
  let ix = poolIndex.get(pool);
  if (!ix) poolIndex.set(pool, (ix = pool.map((e) => ({ e, g: grams(e.freeText) }))));
  return ix;
};

export function retrieve(freeText: string, k = 3, exclude?: string, pool?: Example[]): Example[] {
  const q = grams(freeText);
  return indexOf(pool)
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

export function buildPrompt(freeText: string, airport: Airport, exclude?: string, pool?: Example[]): string {
  const tz = tzOf(airport);
  const input = annotateLocalTimes(freeText);
  const shots = retrieve(freeText, 3, exclude, pool)
    .map((e, i) => `Contoh ${i + 1}\nInput: ${e.freeText}\nNOTAM:\n${e.notam}`)
    .join('\n\n');
  return [
    'Anda asisten penyusun draf NOTAM. Ubah teks bebas menjadi NOTAM berformat ICAO (item Q, A, B, C, D, E).',
    'Aturan: gunakan hanya informasi pada input dan konteks; jangan mengarang. Jika informasi tidak cukup, tulis item itu sebagai "TIDAK DAPAT DITENTUKAN". Waktu B)/C) dalam UTC format YYMMDDHHMM; jam berzona WIB/WITA/WIT sudah dikonversi sistem: pakai nilai pada anotasi [UTC ...] ("tanggal -1 hari" berarti mundurkan tanggal sehari); jam tak berlabel di narasi yang memuat jam berlabel ikut zona itu (anotasi juga memuatnya); bila tidak ada label zona sama sekali, tulis apa adanya (dianggap UTC). Alasan (DUE TO ...) hanya boleh ditulis bila input menyebut alasannya; bila input hanya menyebut kondisi (mis. ditutup), tulis kondisi saja tanpa DUE TO. Alasan ditulis dengan singkatan baku AirNav: pemeliharaan/perawatan = DUE TO MAINT, pekerjaan = DUE TO WIP; alasan lain ditulis singkat tanpa mengulang nama objek. Landasan, taxiway, apron, dan stand yang ditutup ATAU tidak dapat digunakan = CLSD (kondisi LC); hanya yang masih bisa dipakai di bawah kendali ATC memakai WIP (kondisi HW) atau LIMITED (kondisi LT). U/S hanya untuk peralatan, lampu, dan navaid. Kata "sementara" tidak diterjemahkan: jangan menulis TEMPORARILY, TEMPORARY, atau TEMPO di E); masa berlaku cukup di B) dan C).',
    `Konteks bandara: LocId ${airport.locId}; nama ${airport.name}; kota ${airport.city}; FIR ${airport.fir}; ARP ${validArp(airport) ?? 'tidak tersedia'}; zona waktu lokal ${tz ? `${tz.label} (UTC+${tz.offset})` : 'tidak diketahui'}.`,
    shots ? `Contoh dari dataset (referensi gaya, bukan fakta untuk input ini):\n\n${shots}` : '',
    `Input:\n${input}\n\nNOTAM:`,
  ]
    .filter(Boolean)
    .join('\n\n');
}
