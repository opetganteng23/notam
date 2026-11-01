import { expectedUtcStamps, annotateLocalTimes } from './src/master/time';
import { correctNotam } from './src/generator/generator';
import { validateNotam } from './src/generator/validator';
import { findAirport } from './src/master/airports';
const ap = findAirport('WIHH')!;
const inputs = {
  'ejaan data (NOPEMBER)': 'DITUTUP RUNWAY 06/24 BANDARA HALIM PERDANAKUSUMA (WIHH) INDICATOR KARENA ADA PEKERJAAN PADA TANGGAL 03 NOPEMBER 2024 JAM 0000 WIB SAMPAI DENGAN TGL 03 NOPEMBER 2024 JAM 0500 WIB',
  'ejaan baku (NOVEMBER)': 'DITUTUP RUNWAY 06/24 BANDARA HALIM PERDANAKUSUMA (WIHH) INDICATOR KARENA ADA PEKERJAAN PADA TANGGAL 03 NOVEMBER 2024 JAM 0000 WIB SAMPAI DENGAN TGL 03 NOVEMBER 2024 JAM 0500 WIB',
};
const good = `Q) WIIF/QMRLC/IV/NBO/A/000/999/0616S10653E005\nA) WIHH\nB) 2411021700\nC) 2411022200\nE) RWY 06/24 CLSD DUE TO WIP`;
const bad = good.replace('2411021700', '2411030000').replace('2411022200', '2411030500'); // jam WIB tidak dikonversi
for (const [k, t] of Object.entries(inputs)) {
  console.log('\n###', k);
  console.log('anotasi  :', annotateLocalTimes(t).slice(-120));
  console.log('expected :', JSON.stringify(expectedUtcStamps(t)));
  for (const [n, out] of [['keluaran benar', good], ['keluaran SALAH (WIB tak dikonversi)', bad]] as const) {
    const c = correctNotam(out, ap, t);
    const v = validateNotam(c.text, 'WIHH', t);
    console.log(`- ${n}: koreksi=${JSON.stringify(c.corrections)} validasi=${v.status} ${JSON.stringify(v.issues.map(i=>i.code))}`);
  }
}
