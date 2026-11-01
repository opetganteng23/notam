import { endBeforeStart } from './input-check';
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
});
