import { buildDictionary } from './dictionary';
import { listAirports } from '../master/airports';

describe('kamus', () => {
  const cats = buildDictionary();
  const cat = (id: string) => cats.find((c) => c.id === id)!;
  const table = (c: string, t: string) => cat(c).tables.find((x) => x.id === t)!;

  it('memuat sembilan kategori berurutan, masing-masing dengan sumber dan ringkasan', () => {
    expect(cats.map((c) => c.id)).toEqual(['bandara', 'fir', 'qcode', 'singkatan', 'istilah', 'item', 'waktu', 'aplikasi', 'pelabelan']);
    for (const c of cats) {
      expect(c.title && c.summary && c.source).toBeTruthy();
      expect(c.tables.length).toBeGreaterThan(0);
      for (const t of c.tables) {
        expect(t.rows.length).toBeGreaterThan(0);
        for (const r of t.rows) for (const col of t.columns) expect(r).toHaveProperty(col.key); // setiap kolom terisi pada setiap baris
      }
    }
  });

  it('bandara: semua baris master, zona terisi, FIR konsisten dengan tabel FIR', () => {
    const rows = table('bandara', 'bandara').rows;
    expect(rows).toHaveLength(listAirports().length);
    expect(rows.find((r) => r.locId === 'WIHH')).toMatchObject({ name: 'HALIM PERDANAKUSUMA', fir: 'WIIF', zona: 'WIB', mutu: 'Baku' });
    expect(rows.find((r) => r.locId === 'WADD')?.zona).toBe('WITA');
    const fir = table('fir', 'fir').rows;
    expect(fir.reduce((a, r) => a + (r.bandara as number), 0)).toBe(rows.length);
    expect(fir.map((r) => r.kode).sort()).toEqual(['WAAF', 'WIIF']);
  });

  it('kode Q: jumlah kelompok dan subjek cocok dengan dataset dan saling konsisten', () => {
    const sum = (rows: { jumlah?: unknown }[]) => rows.reduce((a, r) => a + (r.jumlah as number), 0);
    const g = sum(table('qcode', 'kelompok').rows), s = sum(table('qcode', 'subjek').rows), c = sum(table('qcode', 'kondisi').rows);
    expect(g).toBeGreaterThan(900);
    expect(s).toBe(g);
    expect(c).toBe(g);
    expect(table('qcode', 'subjek').rows[0]).toMatchObject({ kode: 'MR', arti: 'Runway' });
    expect(table('qcode', 'kelompok').rows[0]).toMatchObject({ kode: 'M', nama: 'Area pergerakan dan pendaratan' });
    expect(table('qcode', 'kondisi').rows.find((r) => r.kode === 'LC')).toMatchObject({ arti: 'Ditutup' });
    expect(table('qcode', 'sebaran').rows.some((r) => r.bagian === 'Traffic' && r.nilai === 'IV')).toBe(true);
  });

  it('singkatan: dikelompokkan per tema, kode unik, jumlah kemunculan dihitung dari dataset', () => {
    const tables = cat('singkatan').tables;
    expect(tables.length).toBeGreaterThanOrEqual(5);
    const kodes = tables.flatMap((t) => t.rows.map((r) => r.kode as string));
    expect(new Set(kodes).size).toBe(kodes.length);
    const find = (k: string) => tables.flatMap((t) => t.rows).find((r) => r.kode === k)!;
    expect(find('RWY')).toMatchObject({ inggris: 'Runway', indonesia: 'Landasan pacu' });
    expect(find('RWY').jumlah as number).toBeGreaterThan(500);
    expect(find('U/S').jumlah as number).toBeGreaterThan(100);
    expect(find('WIP').jumlah as number).toBeGreaterThan(100);
  });

  it('item, waktu, dan aplikasi memuat aturan sistem', () => {
    expect(table('item', 'item').rows.map((r) => r.item)).toEqual(['Q)', 'A)', 'B)', 'C)', 'D)', 'E)', 'F) / G)']);
    expect(table('waktu', 'zona').rows.map((r) => r.zona)).toEqual(['WIB', 'WITA', 'WIT', 'UTC']);
    expect(table('aplikasi', 'peran').rows).toHaveLength(5);
    expect(table('aplikasi', 'status').rows.map((r) => r.status)).toContain('Disetujui NOF');
    expect(table('aplikasi', 'validasi').rows.some((r) => String(r.kode).includes('D_FORMAT'))).toBe(true);
  });

  it('hasil dikembalikan dari cache (objek sama)', () => {
    expect(buildDictionary()).toBe(cats);
  });
});
