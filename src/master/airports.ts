import { readFileSync } from 'fs';
import { join } from 'path';

export interface Airport {
  name: string;
  locId: string;
  city: string;
  arp: string;
  fir: string;
}

// Sumber: bandara-qcode-coord-fir.xlsx (diekspor ke data/airports.json). Statis; versioning master menyusul.
const airports: Airport[] = JSON.parse(readFileSync(join(__dirname, '..', '..', 'data', 'airports.json'), 'utf8'));
const byLoc = new Map(airports.map((a) => [a.locId, a]));

export const findAirport = (locId: string) => byLoc.get(locId);
export const listAirports = () => airports;

// Locator bandara lain yang disebut di teks (token 4 huruf kapital yang ada di master).
export function mentionedLocators(text: string): string[] {
  const found = new Set<string>();
  for (const t of text.toUpperCase().match(/\b[A-Z]{4}\b/g) ?? []) if (byLoc.has(t)) found.add(t);
  return [...found];
}

// Nama bandara lain yang disebut di teks, mis. "Bandar Udara Juanda" (WARR). Nama pendek (< 5 huruf) diabaikan agar tidak salah cocok.
const normName = (s: string) => ` ${s.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()} `;
const named = airports.filter((a) => a.name && normName(a.name).trim().length >= 5).map((a) => ({ a, n: normName(a.name) }));
export function mentionedAirportNames(text: string, ownLocId: string): Airport[] {
  const t = normName(text);
  const own = normName(byLoc.get(ownLocId)?.name ?? '');
  const seen = new Set<string>();
  return named.filter(({ a, n }) => a.locId !== ownLocId && n !== own && !own.includes(n) && t.includes(n) && !seen.has(a.locId) && !!seen.add(a.locId)).map((x) => x.a);
}

// ARP "0616S10653E" -> "0616S10653E" bila formatnya valid; selain itu null (data master tidak standar).
export const validArp = (a: Airport) => (/^\d{4}[NS]\d{5}[EW]$/.test(a.arp) ? a.arp : null);

export interface Tz {
  label: 'WIB' | 'WITA' | 'WIT';
  offset: number;
}

// Zona waktu diturunkan dari bujur ARP (heuristik: <114.5E WIB, >=126.5E WIT, selain itu WITA); belum ada kolom zona di master.
// Bandara dekat batas zona (mis. Kalimantan Tengah/Selatan) bisa keliru sampai master dilengkapi. ARP tidak valid -> null.
export function tzOf(a: Airport): Tz | null {
  const m = /^\d{4}[NS](\d{3})(\d{2})E$/.exec(validArp(a) ?? '');
  if (!m) return null;
  const lon = Number(m[1]) + Number(m[2]) / 60;
  return lon < 114.5 ? { label: 'WIB', offset: 7 } : lon < 126.5 ? { label: 'WITA', offset: 8 } : { label: 'WIT', offset: 9 };
}
