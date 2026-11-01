import { readFileSync } from 'fs';
import { join } from 'path';
import { CONDITION_NAME, GROUP_NAME, SUBJECT_NAME } from '../analytics/types';
import { listAirports, tzOf, validArp } from '../master/airports';
import { ABBR, FIR_NAME, ISTILAH, ITEM_NOTAM, PELABELAN, PERAN, Q_LINE, STATUS, VALIDASI, WAKTU_ATURAN, WAKTU_ZONA } from './data';

export interface DictColumn { key: string; label: string; mono?: boolean; num?: boolean }
export interface DictTable { id: string; title: string; note?: string; columns: DictColumn[]; rows: Record<string, string | number>[] }
export interface DictCategory { id: string; title: string; summary: string; source: string; tables: DictTable[] }

const Q = /Q\)\s*\w{4}\/Q([A-Z])([A-Z])([A-Z]{2})\/(\w+)\/(\w+)\/(\w+)\//;
const E = /^\s*E\)\s*([\s\S]*)$/m;
const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '–');
const sortN = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

let cache: DictCategory[] | null = null;

// Kamus dibangun sekali dari master, dataset, dan data tangan; jumlah kemunculan dihitung, bukan diketik.
export function buildDictionary(): DictCategory[] {
  if (cache) return cache;
  const examples: { notam: string }[] = JSON.parse(readFileSync(join(__dirname, '..', '..', 'data', 'examples.json'), 'utf8'));

  const groups = new Map<string, number>(), subjects = new Map<string, number>(), conds = new Map<string, number>();
  const traffic = new Map<string, number>(), purpose = new Map<string, number>(), scope = new Map<string, number>();
  const subjExample = new Map<string, string>(), condExample = new Map<string, string>();
  const tokens = new Map<string, number>();
  let coded = 0;
  for (const ex of examples) {
    const e = E.exec(ex.notam)?.[1]?.trim().replace(/\s+/g, ' ') ?? '';
    for (const t of e.toUpperCase().replace(/[^A-Z0-9/\-. ]/g, ' ').split(/\s+/)) if (t) inc(tokens, t.replace(/\.+$/, ''));
    const m = Q.exec(ex.notam);
    if (!m) continue;
    coded++;
    inc(groups, m[1]); inc(subjects, m[1] + m[2]); inc(conds, m[3]);
    inc(traffic, m[4]); inc(purpose, m[5]); inc(scope, m[6]);
    if (!subjExample.has(m[1] + m[2])) subjExample.set(m[1] + m[2], e.slice(0, 90));
    if (!condExample.has(m[3])) condExample.set(m[3], e.slice(0, 90));
  }

  // ---- bandara
  const ap = [...listAirports()].sort((a, b) => a.locId.localeCompare(b.locId));
  const dup = ap.length - new Set(ap.map((a) => a.locId)).size;
  const arpOdd = ap.filter((a) => !validArp(a)).length;
  const firCount = new Map<string, number>();
  for (const a of ap) inc(firCount, a.fir);
  const bandara: DictCategory = {
    id: 'bandara', title: 'Kode bandara', source: 'Master bandara (data/airports.json, dari bandara-qcode-coord-fir.xlsx)',
    summary: `${ap.length} bandara dengan lokator ICAO, kota, FIR, titik referensi (ARP), dan zona waktu.`,
    tables: [{
      id: 'bandara', title: 'Daftar bandara',
      note: `Kualitas master: ${arpOdd} ARP tidak berformat baku dan ${dup} lokator ganda; perlu dibereskan AirNav. Zona waktu diturunkan dari bujur ARP.`,
      columns: [{ key: 'locId', label: 'Lokator', mono: true }, { key: 'name', label: 'Nama bandara' }, { key: 'city', label: 'Kota' }, { key: 'fir', label: 'FIR', mono: true }, { key: 'arp', label: 'ARP', mono: true }, { key: 'zona', label: 'Zona' }, { key: 'mutu', label: 'Format ARP' }],
      rows: ap.map((a) => ({ locId: a.locId, name: a.name, city: a.city, fir: a.fir, arp: a.arp, zona: tzOf(a)?.label ?? '–', mutu: validArp(a) ? 'Baku' : 'Tidak baku' })),
    }],
  };

  // ---- FIR
  const fir: DictCategory = {
    id: 'fir', title: 'FIR', source: 'Master bandara', summary: 'Dua daerah informasi penerbangan Indonesia yang dipakai pada garis Q.',
    tables: [{
      id: 'fir', title: 'Daerah informasi penerbangan',
      columns: [{ key: 'kode', label: 'Kode', mono: true }, { key: 'nama', label: 'Nama' }, { key: 'bandara', label: 'Jumlah bandara', num: true }],
      rows: sortN(firCount).map(([k, n]) => ({ kode: k, nama: FIR_NAME[k] ?? '(belum ada nama)', bandara: n })),
    }],
  };

  // ---- kode Q
  const qcode: DictCategory = {
    id: 'qcode', title: 'Kode Q', source: 'Kelompok: pengelompokan kode Q ICAO. Subjek dan kondisi: disimpulkan dari contoh item E pada dataset; bukan tabel resmi AirNav',
    summary: `Kode Q terdiri dari kelompok, subjek, dan kondisi. Jumlah dihitung dari ${coded} NOTAM pada dataset.`,
    tables: [
      {
        id: 'kelompok', title: 'Kelompok (huruf pertama setelah Q)',
        columns: [{ key: 'kode', label: 'Kode', mono: true }, { key: 'nama', label: 'Kelompok' }, { key: 'jumlah', label: 'Di dataset', num: true }, { key: 'porsi', label: 'Porsi', num: true }],
        rows: Object.entries(GROUP_NAME).map(([k, v]) => ({ kode: k, nama: v, jumlah: groups.get(k) ?? 0, porsi: pct(groups.get(k) ?? 0, coded) })).sort((a, b) => (b.jumlah as number) - (a.jumlah as number)),
      },
      {
        id: 'subjek', title: 'Subjek (dua huruf)', note: 'Kode tanpa arti berarti contohnya kurang tegas; arti sengaja tidak ditebak.',
        columns: [{ key: 'kode', label: 'Kode', mono: true }, { key: 'kelompok', label: 'Kelompok' }, { key: 'arti', label: 'Arti' }, { key: 'jumlah', label: 'Di dataset', num: true }, { key: 'contoh', label: 'Contoh item E', mono: true }],
        rows: sortN(subjects).map(([k, n]) => ({ kode: k, kelompok: GROUP_NAME[k[0]] ?? k[0], arti: SUBJECT_NAME[k] ?? '(belum ada arti)', jumlah: n, contoh: subjExample.get(k) ?? '' })),
      },
      {
        id: 'kondisi', title: 'Kondisi (dua huruf terakhir)',
        columns: [{ key: 'kode', label: 'Kode', mono: true }, { key: 'arti', label: 'Arti' }, { key: 'jumlah', label: 'Di dataset', num: true }, { key: 'contoh', label: 'Contoh item E', mono: true }],
        rows: sortN(conds).map(([k, n]) => ({ kode: k, arti: CONDITION_NAME[k] ?? '(belum ada arti)', jumlah: n, contoh: condExample.get(k) ?? '' })),
      },
      {
        id: 'sebaran', title: 'Nilai Traffic, Purpose, dan Scope yang dipakai di dataset',
        columns: [{ key: 'bagian', label: 'Bagian' }, { key: 'nilai', label: 'Nilai', mono: true }, { key: 'jumlah', label: 'Di dataset', num: true }],
        rows: [['Traffic', traffic], ['Purpose', purpose], ['Scope', scope]].flatMap(([b, m]) => sortN(m as Map<string, number>).map(([k, n]) => ({ bagian: b as string, nilai: k, jumlah: n }))),
      },
    ],
  };

  // ---- singkatan, per tema
  const singkatan: DictCategory = {
    id: 'singkatan', title: 'Singkatan', source: 'Istilah ICAO yang umum dipakai pada NOTAM. Arti Indonesia adalah terjemahan kerja, perlu divalidasi AirNav',
    summary: `${ABBR.reduce((a, g) => a + g.items.length, 0)} singkatan dalam ${ABBR.length} kelompok. Kolom "Di dataset" menunjukkan berapa kali muncul pada item E dataset.`,
    tables: ABBR.map((g) => ({
      id: `singkatan-${g.id}`, title: g.title,
      columns: [{ key: 'kode', label: 'Singkatan', mono: true }, { key: 'inggris', label: 'Istilah ICAO' }, { key: 'indonesia', label: 'Arti Indonesia' }, { key: 'jumlah', label: 'Di dataset', num: true }],
      rows: g.items.map(([kode, inggris, indonesia]) => ({ kode, inggris, indonesia, jumlah: tokens.get(kode) ?? 0 })),
    })),
  };

  const istilah: DictCategory = {
    id: 'istilah', title: 'Istilah Indonesia', source: 'Pemetaan yang dipakai sistem saat menyusun dan melabeli NOTAM',
    summary: 'Kata dalam narasi bahasa Indonesia dan padanannya pada NOTAM.',
    tables: [{ id: 'istilah', title: 'Narasi ke NOTAM', columns: [{ key: 'indonesia', label: 'Dalam narasi' }, { key: 'notam', label: 'Pada NOTAM', mono: true }, { key: 'keterangan', label: 'Keterangan' }], rows: ISTILAH.map(([indonesia, notam, keterangan]) => ({ indonesia, notam, keterangan })) }],
  };

  const item: DictCategory = {
    id: 'item', title: 'Item NOTAM', source: 'Aturan validator sistem',
    summary: 'Arti, format, dan aturan setiap item serta bagian garis Q.',
    tables: [
      { id: 'item', title: 'Item', columns: [{ key: 'item', label: 'Item', mono: true }, { key: 'arti', label: 'Arti' }, { key: 'format', label: 'Format' }, { key: 'contoh', label: 'Contoh', mono: true }, { key: 'aturan', label: 'Aturan di sistem' }], rows: ITEM_NOTAM },
      { id: 'garis-q', title: 'Bagian garis Q', columns: [{ key: 'bagian', label: 'Bagian' }, { key: 'arti', label: 'Arti' }, { key: 'nilai', label: 'Nilai' }], rows: Q_LINE },
    ],
  };

  const waktu: DictCategory = {
    id: 'waktu', title: 'Waktu', source: 'Aturan sistem', summary: 'Zona waktu Indonesia dan cara sistem mengonversinya ke UTC.',
    tables: [
      { id: 'zona', title: 'Zona waktu', columns: [{ key: 'zona', label: 'Zona', mono: true }, { key: 'selisih', label: 'Selisih', mono: true }, { key: 'wilayah', label: 'Keterangan' }], rows: WAKTU_ZONA },
      { id: 'aturan-waktu', title: 'Aturan konversi', columns: [{ key: 'aturan', label: 'Kasus' }, { key: 'keterangan', label: 'Perlakuan' }], rows: WAKTU_ATURAN },
    ],
  };

  const aplikasi: DictCategory = {
    id: 'aplikasi', title: 'Aplikasi', source: 'Alur kerja sistem (MoM AirNav 21 April 2025)', summary: 'Peran, status pengajuan, dan arti kode hasil validasi.',
    tables: [
      { id: 'peran', title: 'Peran', columns: [{ key: 'peran', label: 'Peran', mono: true }, { key: 'tugas', label: 'Tugas' }, { key: 'batas', label: 'Batasan' }], rows: PERAN },
      { id: 'status', title: 'Status pengajuan', columns: [{ key: 'status', label: 'Status' }, { key: 'arti', label: 'Arti' }, { key: 'berikutnya', label: 'Langkah berikutnya' }], rows: STATUS },
      { id: 'validasi', title: 'Kode hasil validasi', columns: [{ key: 'kode', label: 'Kode', mono: true }, { key: 'tingkat', label: 'Tingkat' }, { key: 'arti', label: 'Arti' }], rows: VALIDASI },
    ],
  };

  const pelabelan: DictCategory = {
    id: 'pelabelan', title: 'Pelabelan dataset', source: 'NOTAM Dataset Labelling Guidelines', summary: 'Entitas yang dipakai tim saat melabeli narasi NOTAM.',
    tables: [{ id: 'entitas', title: 'Entitas', columns: [{ key: 'entitas', label: 'Entitas', mono: true }, { key: 'arti', label: 'Arti' }, { key: 'contoh', label: 'Contoh' }], rows: PELABELAN }],
  };

  cache = [bandara, fir, qcode, singkatan, istilah, item, waktu, aplikasi, pelabelan];
  return cache;
}
