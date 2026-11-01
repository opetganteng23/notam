import * as ExcelJS from 'exceljs';
import { Analytics, Row, fmtDuration } from './analytics';

export const STATUS_ID: Record<string, string> = {
  UNDER_ATS: 'Review ATS', UNDER_PIA: 'Review PIA', UNDER_NOF: 'Review NOF',
  REVISION_REQUIRED: 'Perlu revisi', REJECTED: 'Ditolak', APPROVED_BY_NOF: 'Disetujui NOF',
};

const NAVY = 'FF0B2545';
const BAND = 'FFEAF2FB';
const thin = { style: 'thin' as const, color: { argb: 'FFDBE5F1' } };

type Period = { period: { from: string | null; to: string | null; airport: string | null } };
export const periodLabel = (a: Period) => {
  const d = (s: string | null) => (s ? new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }) : null);
  const f = d(a.period.from), t = d(a.period.to);
  const range = f || t ? `${f ?? 'awal data'} – ${t ?? 'sekarang'}` : 'Seluruh periode';
  return a.period.airport ? `${range} · Bandara ${a.period.airport}` : range;
};

type Fmt = string | undefined;
// Sel dengan format sendiri: { v, f }
type Cell = string | number | null | { v: number | null; f: string };

// Menulis tabel berjudul: judul, baris header (navy), baris data bergaris tipis. Mengembalikan baris kosong berikutnya.
export function table(ws: ExcelJS.Worksheet, row: number, title: string, headers: string[], data: Cell[][], fmts: Fmt[] = []): number {
  const t = ws.getCell(row, 1);
  t.value = title;
  t.font = { bold: true, size: 12, color: { argb: NAVY } };
  const h = ws.getRow(row + 1);
  headers.forEach((text, i) => {
    const c = h.getCell(i + 1);
    c.value = text;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    c.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center', wrapText: true };
  });
  h.height = 22;
  data.forEach((vals, r) => {
    const rr = ws.getRow(row + 2 + r);
    vals.forEach((v, i) => {
      const c = rr.getCell(i + 1);
      const own = typeof v === 'object' && v !== null ? v : null;
      const val = own ? own.v : (v as string | number | null);
      c.value = val ?? '-';
      const f = own ? own.f : fmts[i];
      if (f && typeof val === 'number') c.numFmt = f;
      c.border = { bottom: thin };
      c.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center', wrapText: i === 0 };
      if (r % 2) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    });
  });
  if (!data.length) ws.getCell(row + 2, 1).value = 'Tidak ada data';
  return row + 3 + Math.max(data.length, 1);
}

export function sheet(wb: ExcelJS.Workbook, name: string, title: string, a: Period & { period: { generatedAt: string } }, widths: number[]) {
  const ws = wb.addWorksheet(name, { views: [{ showGridLines: false }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.getCell('A1').value = title;
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: NAVY } };
  ws.getCell('A2').value = `${periodLabel(a)} · dibuat ${new Date(a.period.generatedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`;
  ws.getCell('A2').font = { italic: true, color: { argb: 'FF66758A' } };
  return ws;
}

export async function analyticsToExcel(a: Analytics, rows: Row[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NOTAM AI Generator';
  wb.created = new Date(a.period.generatedAt);
  const k = a.kpi;

  // 1. Ringkasan
  let ws = sheet(wb, 'Ringkasan', 'Ringkasan Eksekutif NOTAM', a, [42, 18, 62]);
  let r = table(ws, 4, 'Indikator utama', ['Indikator', 'Nilai', 'Keterangan'], [
    ['Total pengajuan', k.total, 'Pengajuan yang sudah disubmit (Draft tidak dihitung)'],
    ['Disetujui NOF', k.approved, 'Status akhir disetujui'],
    ['Ditolak', k.rejected, 'Status akhir ditolak'],
    ['Dalam review', k.inReview, 'Sedang di ATS, PIA, atau NOF'],
    ['Menunggu revisi Originator', k.needsRevision, 'Dikembalikan dan belum disubmit ulang'],
    ['Tingkat persetujuan', { v: k.approvalRate, f: '0%' }, 'Disetujui ÷ (disetujui + ditolak)'],
    ['Disetujui tanpa revisi', { v: k.firstPassRate, f: '0%' }, 'Dari yang disetujui, tanpa satu pun revisi atau penolakan'],
    ['Rata-rata waktu penyelesaian (jam)', { v: k.avgTurnaroundH, f: '0.0' }, 'Submit pertama hingga disetujui NOF'],
    ['Median waktu penyelesaian (jam)', { v: k.medianTurnaroundH, f: '0.0' }, 'Nilai tengah, lebih tahan terhadap kasus ekstrem'],
    ['Rata-rata revisi per pengajuan', { v: k.avgRevisions, f: '0.0' }, 'Jumlah aksi Revisi per pengajuan'],
    ['Menunggu > 24 jam', k.pendingOver24h, 'Pengajuan yang berhenti di satu tahap lebih dari 24 jam'],
  ]);
  r = table(ws, r + 1, 'Temuan utama', ['Temuan'], a.insights.map((s) => [s]));
  for (let i = r - a.insights.length - 1; i < r - 1; i++) { ws.mergeCells(i, 1, i, 3); ws.getRow(i).height = 32; ws.getCell(i, 1).alignment = { wrapText: true, vertical: 'middle' }; }
  ws.views = [{ showGridLines: false, state: 'frozen', ySplit: 2 }];

  // 2. Tren
  ws = sheet(wb, 'Tren', `Tren pengajuan per ${a.granularity === 'day' ? 'hari' : 'bulan'}`, a, [18, 14, 14]);
  table(ws, 4, 'Jumlah per periode', ['Periode', 'Diajukan', 'Disetujui'], a.series.map((s) => [s.period, s.submitted, s.approved]));

  // 3. Alur
  ws = sheet(wb, 'Alur & Tahapan', 'Alur persetujuan dan kinerja tahapan', a, [30, 14, 18, 18, 18, 16]);
  r = table(ws, 4, 'Distribusi status saat ini', ['Status', 'Jumlah', 'Persentase'], Object.entries(a.status).map(([s, n]) => [STATUS_ID[s] ?? s, n, k.total ? n / k.total : 0]), [undefined, undefined, '0%']);
  r = table(ws, r + 1, 'Funnel persetujuan', ['Tahap', 'Jumlah', 'Dari diajukan'], a.funnel.map((f) => [f.label, f.n, a.funnel[0].n ? f.n / a.funnel[0].n : 0]), [undefined, undefined, '0%']);
  r = table(ws, r + 1, 'Lama tinggal per tahap (jam)', ['Tahap', 'Sampel', 'Rata-rata', 'Median', 'Terlama', 'Rata-rata (teks)'], a.stages.map((s) => [s.stage, s.n, s.avgH, s.medianH, s.maxH, fmtDuration(s.avgH)]), [undefined, undefined, '0.0', '0.0', '0.0']);
  r = table(ws, r + 1, 'Sedang menunggu saat ini', ['Tahap', 'Jumlah', 'Terlama (jam)', '> 24 jam'], a.pending.map((p) => [p.stage, p.n, p.oldestH, p.over24h]), [undefined, undefined, '0.0']);
  table(ws, r + 1, 'Pengembalian per role', ['Role', 'Revisi', 'Tolak'], a.returns.map((x) => [x.role, x.revise, x.reject]));

  // 4. Bandara & jenis
  ws = sheet(wb, 'Bandara & Jenis', 'Bandara dan jenis NOTAM', a, [34, 14, 14, 14, 40]);
  r = table(ws, 4, 'Bandara teratas', ['Bandara', 'Pengajuan', 'Disetujui', 'Ditolak', 'Nama'], a.airports.map((x) => [x.airport, x.n, x.approved, x.rejected, x.name]));
  r = table(ws, r + 1, 'FIR', ['FIR', 'Pengajuan'], a.fir.map((x) => [x.fir, x.n]));
  table(ws, r + 1, 'Kode Q teratas', ['Kode Q', 'Pengajuan', 'Arti'], a.qcodes.map((x) => [x.code, x.n, x.label]));

  // 5. Pengusul
  ws = sheet(wb, 'Pengusul', 'Kinerja pengusul (Originator)', a, [26, 14, 14, 14, 18]);
  table(ws, 4, 'Pengusul teratas', ['Pengusul', 'Pengajuan', 'Disetujui', 'Ditolak', 'Tingkat persetujuan'], a.originators.map((x) => [x.originator, x.n, x.approved, x.rejected, x.approvalRate]), [undefined, undefined, undefined, undefined, '0%']);

  // 6. Kualitas AI
  ws = sheet(wb, 'Kualitas AI', 'Kualitas hasil AI', a, [38, 16, 16]);
  const v = a.ai.validation;
  const vt = (v.passed ?? 0) + (v.warning ?? 0) + (v.failed ?? 0);
  r = table(ws, 4, 'Hasil validasi versi terakhir', ['Hasil', 'Jumlah', 'Persentase'], [['Lolos', v.passed ?? 0, vt ? (v.passed ?? 0) / vt : 0], ['Peringatan', v.warning ?? 0, vt ? (v.warning ?? 0) / vt : 0], ['Gagal', v.failed ?? 0, vt ? (v.failed ?? 0) / vt : 0]], [undefined, undefined, '0%']);
  r = table(ws, r + 1, 'Indikator', ['Indikator', 'Nilai'], [['Langsung lolos validasi', { v: k.aiPassRate, f: '0%' }], ['Dikoreksi otomatis oleh sistem', { v: k.correctedRate, f: '0%' }], ['Generate ulang (lebih dari 1 versi)', { v: k.regenRate, f: '0%' }], ['Rata-rata waktu generate (detik)', { v: k.avgGenSec, f: '0.0' }]]);
  table(ws, r + 1, 'Penyedia LLM', ['Penyedia', 'Pengajuan'], a.ai.providers.map((p) => [p.provider, p.n]));

  // 7. Data
  ws = sheet(wb, 'Data', 'Data pengajuan', a, [18, 20, 11, 18, 18, 11, 14, 12, 18, 18, 56, 56]);
  const head = ws.getRow(4);
  ['Nomor Form', 'Tanggal Pengusulan', 'Bandara', 'Pengusul', 'Status', 'Revisi', 'Validasi AI', 'Kode Q', 'Waktu selesai (jam)', 'Menunggu di', 'Notam Prompt', 'Notam Generated'].forEach((t, i) => {
    const c = head.getCell(i + 1);
    c.value = t;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    c.alignment = { vertical: 'middle', wrapText: true };
  });
  head.height = 22;
  rows.sort((x, y) => +new Date(y.createdAt) - +new Date(x.createdAt)).forEach((d, i) => {
    const rr = ws.getRow(5 + i);
    rr.values = [d.formNo, new Date(d.createdAt), d.airport, d.originator, STATUS_ID[d.status] ?? d.status, d.revisions, d.validation, d.qcode, d.turnaroundH ?? '-', d.stageNow, d.prompt, d.generated];
    rr.getCell(11).alignment = { wrapText: true, vertical: 'top' };
    rr.getCell(12).alignment = { wrapText: true, vertical: 'top' };
    rr.getCell(2).numFmt = 'dd mmm yyyy hh:mm';
    if (typeof d.turnaroundH === 'number') rr.getCell(9).numFmt = '0.0';
    if (i % 2) rr.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } }));
  });
  ws.views = [{ showGridLines: false, state: 'frozen', ySplit: 4 }];
  if (rows.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + rows.length, column: 12 } };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
