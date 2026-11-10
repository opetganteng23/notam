import { REGION_CODE, allowedAirports } from './scope';

describe('allowedAirports', () => {
  const all = [{ code: 'JKT', airports: ['WIHH', 'WIII'] }, { code: 'SUB', airports: ['WARR'] }];
  it('tanpa wilayah = tidak dibatasi', () => {
    expect(allowedAirports(all, [])).toBeNull();
    expect(allowedAirports(all, undefined)).toBeNull();
  });
  it('gabungan bandara dari wilayah yang dimiliki', () => {
    expect([...allowedAirports(all, ['JKT'])!].sort()).toEqual(['WIHH', 'WIII']);
    expect([...allowedAirports(all, ['JKT', 'SUB'])!].sort()).toEqual(['WARR', 'WIHH', 'WIII']);
  });
  it('wilayah yang sudah dihapus tidak memberi akses (himpunan kosong, bukan tak terbatas)', () => {
    expect(allowedAirports(all, ['HILANG'])!.size).toBe(0);
  });
  it('format kode wilayah', () => {
    expect(['JKT', 'REG-1', 'A_B'].every((c) => REGION_CODE.test(c))).toBe(true);
    expect(['X', 'jkt', '-AB', 'A B'].some((c) => REGION_CODE.test(c))).toBe(false);
  });
});
