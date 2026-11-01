import { endBeforeStart, hasDate } from './input-check';
import { mentionedAirportNames } from '../master/airports';

describe('pemeriksaan teks masukan', () => {
  it('mendeteksi tanggal selesai lebih awal dari mulai', () => {
    expect(endBeforeStart('ditutup mulai tanggal 9 November 2026 pukul 08.00 WIB sampai tanggal 5 November 2026 pukul 12.00 WIB')).toBe(true);
  });
  it('urutan benar dan satu tanggal tidak ditandai', () => {
    expect(endBeforeStart('mulai tanggal 5 November 2026 pukul 08.00 WIB sampai tanggal 9 November 2026 pukul 12.00 WIB')).toBe(false);
    expect(endBeforeStart('pada tanggal 5 November 2026 pukul 08.00 WIB')).toBe(false);
  });
  it('jam di hari yang sama diperiksa', () => {
    expect(endBeforeStart('4 November 2026 pukul 17.00 WIB sampai 4 November 2026 pukul 08.00 WIB')).toBe(true);
    expect(endBeforeStart('4 November 2026 pukul 08.00 WIB sampai 4 November 2026 pukul 17.00 WIB')).toBe(false);
  });
  it('mendeteksi nama bandara lain di teks', () => {
    expect(mentionedAirportNames('Apron di Bandar Udara Juanda ditutup', 'WADD').map((a) => a.locId)).toEqual(['WARR']);
    expect(mentionedAirportNames('Landasan pacu di Bandar Udara Halim Perdanakusuma ditutup', 'WIII').map((a) => a.locId)).toEqual(['WIHH']);
  });
  it('nama bandara sendiri tidak ditandai', () => {
    expect(mentionedAirportNames('Apron di Bandar Udara Juanda ditutup', 'WARR')).toEqual([]);
  });
  it('mewajibkan tanggal tertulis', () => {
    expect(hasDate('Jam pelayanan bandara saat ini menjadi jam 0830')).toBe(false);
    expect(hasDate('Semua keberangkatan tertunda karena pergerakan VIP')).toBe(false);
    expect(hasDate('ditutup tanggal 01 nopember 2024 jam 0000 UTC')).toBe(true);
    expect(hasDate('mulai 9 Nov 2026 pukul 08.00')).toBe(true);
    expect(hasDate('mulai 09/11/2026 08.00 WIB')).toBe(true);
    expect(hasDate('PADA TANGGAL 2 - 10 NOVEMBER 2023')).toBe(true);
  });
});
