import { labelNarrative } from './labeller';

describe('pelabelan entitas', () => {
  it('sesuai contoh panduan pelabelan (format sederhana)', () => {
    expect(
      labelNarrative('Taxiway WP di Bandara Sam Ratulangi – Manado (WAMM) ditutup karena ada pekerjaan mulai tanggal 1 Februari 2024 pukul 15.00 sampai pukul 19.15').labelled,
    ).toBe(
      'Taxiway/MX WP/POSITION di Bandara Sam Ratulangi – Manado (WAMM)/LOCATION ditutup/LC karena/REASON ada pekerjaan/WIP mulai tanggal 1 Februari 2024 pukul 15.00/B sampai pukul 19.15/C',
    );
  });

  it('variasi posisi, jadwal harian dan catatan', () => {
    expect(labelNarrative('Taxiway NP1 antara Taxiway NP2 dan Taxiway NP3 ditutup').labelled).toBe(
      'Taxiway/MX NP1 antara Taxiway NP2 dan Taxiway NP3/POSITION ditutup/LC',
    );
    const r = labelNarrative('ditutup mulai tanggal 1 Februari 2024 pukul 15:00 sampai tanggal 3 Februari 2024 pukul 19:15 setiap hari pada jam 15:00 sampai dengan 19:15 Catatan: Semua pesawat berhati-hati');
    expect(r.labelled).toContain('pukul 15:00/B');
    expect(r.labelled).toContain('pukul 19:15/C');
    expect(r.labelled).toContain('sampai dengan 19:15/D');
    expect(r.labelled).toContain('berhati-hati/RMK');
  });

  it('entitas membawa offset yang sesuai dengan teks asli; istilah di luar kamus tidak dilabeli', () => {
    const text = 'Lampu foo di Bandara Juwata - Tarakan ditutup';
    const { entities, labelled } = labelNarrative(text);
    for (const e of entities) expect(text.slice(e.start, e.end)).toBe(e.text);
    expect(labelled).toContain('Lampu foo');
    expect(labelled).not.toContain('Lampu/');
    expect(labelNarrative('tidak ada entitas').labelled).toBe('tidak ada entitas');
  });
});
