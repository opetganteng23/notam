// Cakupan bandara per akun. Daftar kosong = tanpa batas (akun lama, NOF, Admin).
export interface Scoped { airports?: string[] }

export const scopeOf = (u: Scoped): string[] => (Array.isArray(u.airports) ? u.airports : []);
export const inScope = (u: Scoped, airport: string): boolean => {
  const a = scopeOf(u);
  return a.length === 0 || a.includes(airport);
};
// Filter Mongo untuk field `airport`; objek kosong bila tanpa batas.
export const airportFilter = (u: Scoped): Record<string, unknown> => {
  const a = scopeOf(u);
  return a.length ? { airport: { $in: a } } : {};
};

// Normalisasi masukan admin: huruf besar, unik, hanya locator yang ada di master.
export function cleanAirports(input: unknown, known: (locId: string) => boolean): string[] {
  if (input === undefined || input === null || input === '') return [];
  const list = Array.isArray(input) ? input : String(input).split(/[\s,;]+/);
  const out: string[] = [];
  for (const raw of list) {
    const l = String(raw).trim().toUpperCase();
    if (!l) continue;
    if (!/^[A-Z]{4}$/.test(l) || !known(l)) throw new Error(`Locator bandara tidak dikenal: ${l}`);
    if (!out.includes(l)) out.push(l);
  }
  return out;
}
