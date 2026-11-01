import { getModel } from './suggest';

describe('saran lanjutan narasi', () => {
  const m = getModel();
  const labels = (t: string) => m.suggest(t).map((s) => s.label.toLowerCase());

  it('mengusulkan lanjutan yang umum di dataset', () => {
    expect(labels('Taxiway A ditutup ')[0]).toContain('karena');
    expect(labels('tidak dapat ').some((l) => l.startsWith('digunakan'))).toBe(true);
  });
  it('melengkapi kata yang sedang diketik', () => {
    const s = m.suggest('Ru');
    expect(s[0].label).toBe('Runway');
    expect(s[0].insert).toBe('nway ');
  });
  it('tidak pernah mengusulkan angka, nama bulan, atau nama bandara', () => {
    for (const t of ['Landasan pacu ', 'PAPI ', 'Apron ', 'di bandar udara ', 'mulai tanggal ', 'Lampu ']) {
      for (const s of m.suggest(t)) {
        expect(s.label).not.toMatch(/\d/);
        expect(s.label.toLowerCase()).not.toMatch(/\b(januari|november|desember|ratulangi|manado|juanda|samarinda)\b/);
      }
    }
  });
  it('teks kosong tidak memberi saran', () => {
    expect(m.suggest('')).toEqual([]);
  });
});
