import { readFileSync } from 'fs';
import { join } from 'path';

// Tabel kode Q resmi ICAO (Doc 8400 PANS-ABC edisi ke-9, Bab 7 "The NOTAM Code"); sumber dan catatan ada di data/icao-notam-code.json.
const table: { subject: Record<string, string>; condition: Record<string, string> } = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'data', 'icao-notam-code.json'), 'utf8'),
);
export const ICAO_SUBJECT = table.subject;
export const ICAO_CONDITION = table.condition;

const short = (s: string) => s.replace(/\s*\(.*$/, '').trim();

// Frasa awal E) -> subjek yang lazim. Hanya frasa yang tegas; diukur ke dataset AirNav (RWY 99/99, TWY 75/75, STAND 29/29, APRON 24/24 yang terkena aturan).
// Kata lampu/marka dikecualikan karena subjeknya lain (LY, LE, MM, dst.).
const TEXT_SUBJECT: { re: RegExp; subjects: string[]; label: string }[] = [
  { re: /^(APRON|APN)\s(?!.*(LGT|LIGHT|TWY|MARKING|EDGE|FLOOD))/, subjects: ['MN'], label: 'APRON' },
  { re: /^(TWY|TAXIWAY)\s(?!.*(LGT|LIGHT|EDGE|CENTER|CENTRE|CL\b))/, subjects: ['MX', 'MY'], label: 'TWY' },
  { re: /^(PRKG STAND|ACFT STAND|AIRCRAFT STAND|STAND)\b/, subjects: ['MP'], label: 'STAND' },
  { re: /^RWY\s(?!.*(LGT|LIGHT|EDGE|CENTER|CENTRE|PAPI|THR|ILS|MARKING|DISPLACED|LOC|GP|STRIP|SHOULDER|TDZ|REIL|RTIL|ALS|ARREST))/, subjects: ['MR'], label: 'RWY' },
];

// Subjek yang lazim menurut frasa awal E) bila frasanya tegas; null bila tidak ada aturan yang berlaku.
export function textSubject(eItem?: string): { subjects: string[]; label: string } | null {
  const e = (eItem ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
  const rule = TEXT_SUBJECT.find((r) => r.re.test(e));
  return rule ? { subjects: rule.subjects, label: rule.label } : null;
}

// Peringatan (bukan galat) atas kode Q: subjek dan kondisi harus ada di tabel ICAO, dan subjek harus cocok dengan frasa awal E) bila tegas.
export function qcodeWarnings(qItem: string, eItem?: string): { code: string; message: string }[] {
  const qc = qItem.split('/')[1] ?? '';
  const subj = qc.slice(1, 3), cond = qc.slice(3, 5);
  const out: { code: string; message: string }[] = [];
  // XX = plain language, sah menurut ICAO walau tidak tercantum di tabel subjek.
  if (!ICAO_SUBJECT[subj] && subj !== 'XX') out.push({ code: 'Q_SUBJECT_UNKNOWN', message: `Subjek kode Q (${subj}) tidak ada di tabel ICAO Doc 8400` });
  if (!ICAO_CONDITION[cond]) out.push({ code: 'Q_CONDITION_UNKNOWN', message: `Kondisi kode Q (${cond}) tidak ada di tabel ICAO Doc 8400` });
  const e = (eItem ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
  const rule = TEXT_SUBJECT.find((r) => r.re.test(e));
  if (rule && !rule.subjects.includes(subj)) {
    const lazim = rule.subjects.map((s) => `${s} (${short(ICAO_SUBJECT[s])})`).join(' atau ');
    out.push({ code: 'Q_SUBJECT_TEXT', message: `Subjek kode Q ${subj}${ICAO_SUBJECT[subj] ? ` (${short(ICAO_SUBJECT[subj])})` : ''} tidak cocok dengan E) yang diawali "${rule.label}"; lazimnya ${lazim}. Periksa kode Q` });
  }
  return out;
}
