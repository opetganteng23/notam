import { readFileSync } from 'fs';
import { join } from 'path';

// Traffic/Purpose/Scope pada Q) hampir selalu ditentukan oleh kode Q-nya (di dataset AirNav 90% NOTAM memakai kombinasi dominan kodenya).
// Kombinasi yang dipakai AirNav per kode dihitung dari data/examples.json; peringatan hanya muncul bila kombinasinya BELUM PERNAH muncul
// untuk kode yang sudah cukup sering terlihat. Diukur leave-one-out pada dataset: alarm palsu ~2%.
const MIN_SEEN = 5;
const VALID = { traffic: /^[IVK]{1,2}$/, purpose: /^[NBOMK]{1,3}$/, scope: /^[AEWK]{1,2}$/ };

// Pembanding untuk kode yang jarang/belum ada di dataset: matriks Traffic/Purpose ICAO (NSC_DOC_8126.xlsx) per subjek+kondisi.
// Sumber, cara pemetaan, dan hasil verifikasinya ada di data/icao-tps.json. Berkas ini opsional.
let icaoTps: Record<string, { s: string; c: Record<string, string> }> = {};
try {
  icaoTps = JSON.parse(readFileSync(join(__dirname, '..', '..', 'data', 'icao-tps.json'), 'utf8')).subject ?? {};
} catch {
  /* tanpa matriks ICAO, hanya pembanding dataset yang berjalan */
}

// Kompatibel bila satu himpunan huruf termasuk himpunan lainnya (mis. B dan BO, NBO dan BO): AirNav lazim memakai versi yang lebih longgar atau ketat.
// Yang bertolak belakang (mis. IV/M untuk kode yang oleh ICAO IV/NBO) yang diperingatkan.
const compatible = (a: string, b: string) => [...a].every((c) => b.includes(c)) || [...b].every((c) => a.includes(c));

// Kombinasi resmi dari tabel NSC AirNav (data/airnav-tps.json) untuk kode yang tabelnya sudah dimiliki; didahulukan daripada dugaan dari dataset.
let official: Record<string, string> = {};
try {
  official = JSON.parse(readFileSync(join(__dirname, '..', '..', 'data', 'airnav-tps.json'), 'utf8')).codes ?? {};
} catch {
  /* tanpa tabel resmi, hanya pembanding dataset/ICAO yang berjalan */
}
export const officialTps = (code: string): string | null => official[code] ?? null;

type Examples = { notam: string }[];
const observed = new Map<string, Map<string, number>>();
try {
  const ex: Examples = JSON.parse(readFileSync(join(__dirname, '..', '..', 'data', 'examples.json'), 'utf8'));
  for (const e of ex) {
    const q = /(?:^|\n)\s*Q\)\s*([^\n]+)/.exec(e.notam)?.[1]?.trim().split('/') ?? [];
    if (q.length < 5 || !/^Q[A-Z]{4}$/.test(q[1])) continue;
    if (!VALID.traffic.test(q[2]) || !VALID.purpose.test(q[3]) || !VALID.scope.test(q[4])) continue; // lewati salah ketik di dataset (mis. 1V/NB0)
    const c = observed.get(q[1]) ?? new Map<string, number>();
    const k = `${q[2]}/${q[3]}/${q[4]}`;
    c.set(k, (c.get(k) ?? 0) + 1);
    observed.set(q[1], c);
  }
} catch {
  /* tanpa dataset, hanya pemeriksaan huruf yang berjalan */
}

export function tpsWarnings(qItem: string): { code: string; message: string }[] {
  const q = qItem.split('/');
  const out: { code: string; message: string }[] = [];
  if (q.length < 5) return out;
  const [, code, traffic, purpose, scope] = q; // huruf sah sudah dijamin Q_LINE di validator
  const seen = observed.get(code);
  const total = seen ? [...seen.values()].reduce((a, b) => a + b, 0) : 0;
  const combo = `${traffic}/${purpose}/${scope}`;
  const nsc = official[code];
  if (nsc && nsc !== combo) {
    out.push({ code: 'Q_TPS_NSC', message: `Traffic/Purpose/Scope ${combo} berbeda dari tabel NSC AirNav untuk ${code} (${nsc}). Periksa Q)` });
  } else if (nsc) {
    /* sesuai tabel resmi */
  } else if (seen && total >= MIN_SEEN && !seen.has(combo)) {
    const usual = [...seen].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${k} (${v}x)`).join(', ');
    out.push({ code: 'Q_TPS_UNUSUAL', message: `Traffic/Purpose/Scope ${combo} belum pernah dipakai untuk ${code} di data AirNav; lazimnya ${usual}. Periksa Q)` });
  } else if (total < MIN_SEEN) {
    const ref = icaoTps[code.slice(1, 3)]?.c[code.slice(3, 5)];
    if (ref) {
      const [rt, rp] = ref.split('/');
      if (!compatible(traffic, rt) || !compatible(purpose, rp))
        out.push({ code: 'Q_TPS_ICAO', message: `Traffic/Purpose ${traffic}/${purpose} bertentangan dengan tabel ICAO untuk ${code} (${ref}). Periksa Q)` });
    }
  }
  return out;
}

// Kombinasi Traffic/Purpose/Scope dominan untuk kode Q bila sudah terlihat minimal MIN_SEEN kali di dataset; selain itu null.
// Dipakai saat kode Q diganti oleh koreksi otomatis: kombinasi lama milik kode yang lama, bukan bukti untuk kode yang baru.
export function usualTps(code: string): string | null {
  if (official[code]) return official[code];
  const seen = observed.get(code);
  const total = seen ? [...seen.values()].reduce((a, b) => a + b, 0) : 0;
  return seen && total >= MIN_SEEN ? [...seen].sort((a, b) => b[1] - a[1])[0][0] : null;
}
