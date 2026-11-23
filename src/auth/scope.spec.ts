import { airportFilter, cleanAirports, inScope } from './scope';

describe('cakupan bandara', () => {
  it('daftar kosong atau tidak ada berarti tanpa batas', () => {
    expect(inScope({}, 'WIII')).toBe(true);
    expect(inScope({ airports: [] }, 'WIII')).toBe(true);
    expect(airportFilter({})).toEqual({});
  });
  it('akun dengan cakupan hanya boleh bandaranya', () => {
    const u = { airports: ['WIII', 'WIRR'] };
    expect(inScope(u, 'WIRR')).toBe(true);
    expect(inScope(u, 'WADY')).toBe(false);
    expect(airportFilter(u)).toEqual({ airport: { $in: ['WIII', 'WIRR'] } });
  });
  it('membersihkan masukan admin', () => {
    const known = (l: string) => ['WIII', 'WIRR'].includes(l);
    expect(cleanAirports('wiii, WIRR wiii', known)).toEqual(['WIII', 'WIRR']);
    expect(cleanAirports(undefined, known)).toEqual([]);
    expect(cleanAirports([], known)).toEqual([]);
    expect(() => cleanAirports('XXXX', known)).toThrow(/tidak dikenal/);
    expect(() => cleanAirports('WI', known)).toThrow(/tidak dikenal/);
  });
});
