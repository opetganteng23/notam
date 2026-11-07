import { findAirport, listAirports } from '../master/airports';

// Aturan akses: draft hanya untuk pembuatnya. Originator melihat miliknya dan NOTAM orang lain yang sudah disetujui NOF;
// ATS, PIA, NOF, dan Admin melihat semua yang sudah disubmit. Dipakai sebagai pagar kedua selain filter query database.
export function canSee(u: { username: string; role: string }, d: { originator: string; status: string }): boolean {
  if (u.role === 'ORIGINATOR') return d.originator === u.username || d.status === 'APPROVED_BY_NOF';
  return d.status !== 'DRAFT';
}

export type Tone = 'bad' | 'wait' | 'ok' | 'draft';
export type ValidityState = 'active' | 'upcoming' | 'expired';

export interface MapDoc {
  formNo: string;
  airport: string;
  originator: string;
  status: string;
  createdAt: Date;
  versions: { freeText?: string; generated?: string; validation?: { status: string } }[];
}

export interface Validity { from: Date | null; to: Date | null; perm: boolean; est: boolean }

export interface MapFilter {
  from?: Date; to?: Date;
  by: 'created' | 'validity';
  status?: string; fir?: string; state?: ValidityState;
  now?: Date;
}

// Koordinat ARP berformat DDMM[N|S]DDDMM[E|W]. Format lain (kosong, NIL, salah ketik) dianggap tidak punya koordinat.
export function parseArp(arp: string | undefined): { lat: number; lon: number } | null {
  const m = /^(\d{2})(\d{2})([NS])(\d{3})(\d{2})([EW])$/.exec(arp ?? '');
  if (!m) return null;
  const lat = (Number(m[1]) + Number(m[2]) / 60) * (m[3] === 'N' ? 1 : -1);
  const lon = (Number(m[4]) + Number(m[5]) / 60) * (m[6] === 'E' ? 1 : -1);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

const stamp = (s: string) => {
  const y = 2000 + Number(s.slice(0, 2)), mo = Number(s.slice(2, 4)), d = Number(s.slice(4, 6)), h = Number(s.slice(6, 8)), mi = Number(s.slice(8, 10));
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  return new Date(Date.UTC(y, mo - 1, d, h, mi));
};

// Masa berlaku dari baris B) dan C) NOTAM (YYMMDDHHMM, UTC). C) boleh PERM atau berakhiran EST.
export function parseValidity(generated: string | undefined): Validity | null {
  const b = /^\s*B\)\s*(\d{10})/m.exec(generated ?? '');
  if (!b) return null;
  const from = stamp(b[1]);
  if (!from) return null;
  const c = /^\s*C\)\s*(?:(\d{10})\s*(EST)?|(PERM))/m.exec(generated ?? '');
  if (!c) return { from, to: null, perm: false, est: false };
  if (c[3]) return { from, to: null, perm: true, est: false };
  return { from, to: stamp(c[1]), perm: false, est: !!c[2] };
}

export function validityState(v: Validity | null, now: Date): ValidityState | null {
  if (!v?.from) return null;
  if (+now < +v.from) return 'upcoming';
  if (v.perm || !v.to || +now <= +v.to) return 'active';
  return 'expired';
}

export const eLine = (generated: string | undefined) => /^\s*E\)\s*([\s\S]*)$/m.exec(generated ?? '')?.[1].replace(/\s+/g, ' ').trim() ?? '';
export const qcodeOf = (generated: string | undefined) => /Q\)\s*\w{4}\/(Q[A-Z]{4})/.exec(generated ?? '')?.[1] ?? '';

export function toneOf(counts: Record<string, number>): Tone {
  if ((counts.REJECTED ?? 0) + (counts.REVISION_REQUIRED ?? 0) > 0) return 'bad';
  if ((counts.UNDER_ATS ?? 0) + (counts.UNDER_PIA ?? 0) + (counts.UNDER_NOF ?? 0) > 0) return 'wait';
  if ((counts.APPROVED_BY_NOF ?? 0) > 0) return 'ok';
  return 'draft';
}

export interface Item {
  formNo: string; airport: string; status: string; createdAt: Date; qcode: string; text: string;
  validFrom: Date | null; validTo: Date | null; perm: boolean; state: ValidityState | null; mine: boolean;
}

// Menerapkan filter waktu, status, FIR, dan status masa berlaku. Fungsi murni agar mudah diuji.
export function selectItems(docs: MapDoc[], f: MapFilter, me: string): Item[] {
  const now = f.now ?? new Date();
  const out: Item[] = [];
  for (const d of docs) {
    const gen = d.versions[d.versions.length - 1]?.generated;
    const v = parseValidity(gen);
    const approved = d.status === 'APPROVED_BY_NOF';
    const state = approved ? validityState(v, now) : null;
    if (f.status && d.status !== f.status) continue;
    if (f.fir && findAirport(d.airport)?.fir !== f.fir) continue;
    if (f.state && state !== f.state) continue;
    if (f.by === 'created') {
      if (f.from && +new Date(d.createdAt) < +f.from) continue;
      if (f.to && +new Date(d.createdAt) > +f.to) continue;
    } else if (f.from || f.to) {
      if (!v?.from) continue;
      const end = v.perm || !v.to ? Infinity : +v.to;
      if (f.from && end < +f.from) continue;
      if (f.to && +v.from > +f.to) continue;
    }
    out.push({
      formNo: d.formNo, airport: d.airport, status: d.status, createdAt: d.createdAt, qcode: qcodeOf(gen), text: eLine(gen),
      validFrom: v?.from ?? null, validTo: v?.to ?? null, perm: !!v?.perm, state, mine: d.originator === me,
    });
  }
  return out;
}

export interface Point {
  airport: string; name: string; city: string; fir: string; lat: number; lon: number;
  n: number; counts: Record<string, number>; tone: Tone | 'none';
}

export function buildPoints(items: Item[], includeAll: boolean) {
  const byAp = new Map<string, Item[]>();
  for (const i of items) byAp.set(i.airport, [...(byAp.get(i.airport) ?? []), i]);
  const points: Point[] = [];
  let noCoord = 0, noCoordAirports = 0;
  const seen = new Set<string>();
  for (const [code, list] of byAp) {
    const ap = findAirport(code);
    const pos = parseArp(ap?.arp);
    seen.add(code);
    if (!ap || !pos) { noCoord += list.length; noCoordAirports++; continue; }
    const counts: Record<string, number> = {};
    for (const i of list) counts[i.status] = (counts[i.status] ?? 0) + 1;
    points.push({ airport: code, name: ap.name, city: ap.city, fir: ap.fir, ...pos, n: list.length, counts, tone: toneOf(counts) });
  }
  if (includeAll) {
    for (const ap of listAirports()) {
      const pos = parseArp(ap.arp);
      if (!pos || seen.has(ap.locId)) continue;
      points.push({ airport: ap.locId, name: ap.name, city: ap.city, fir: ap.fir, ...pos, n: 0, counts: {}, tone: 'none' });
    }
  }
  points.sort((a, b) => b.n - a.n || a.airport.localeCompare(b.airport));
  return { points, noCoord, noCoordAirports };
}

// Jumlah NOTAM per hari (UTC) untuk garis waktu kecil di panel bandara.
export function timeline(items: Item[]) {
  const m = new Map<string, number>();
  for (const i of items) { const k = new Date(i.createdAt).toISOString().slice(0, 10); m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, n]) => ({ day, n }));
}
