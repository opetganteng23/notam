import * as ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';
import { C, FONT, SLIDE_W } from './export-pptx';
import { STATUS_ID, periodLabel, sheet, table } from './export-xlsx';
import { TypeRow, TypesReport, conditionLabel, subjectLabel } from './types';

const name = (k: string, r: TypesReport) => (k === 'Lain' ? 'Lain-lain' : r.groups.find((g) => g.group === k)?.name ?? k);

export async function typesToExcel(r: TypesReport, rows: TypeRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NOTAM AI Generator';
  wb.created = new Date(r.period.generatedAt);

  let ws = sheet(wb, 'Ringkasan Jenis', 'Laporan NOTAM menurut jenis', r, [46, 14, 14, 14, 14]);
  let n = table(ws, 4, 'Kelompok jenis', ['Kelompok', 'Jumlah', 'Persentase', 'Disetujui', 'Ditolak'], r.groups.map((g) => [`${g.name} (${g.group})`, g.n, g.share, g.approved, g.rejected]), [undefined, undefined, '0%']);
  n = table(ws, n + 1, 'Kondisi', ['Kondisi', 'Jumlah', 'Persentase'], r.conditions.map((c) => [`${c.label ?? 'Kode'} (${c.code})`, c.n, c.share]), [undefined, undefined, '0%']);
  n = table(ws, n + 1, 'Temuan utama', ['Temuan'], r.insights.map((s) => [s]));
  for (let i = n - r.insights.length - 1; i < n - 1; i++) { ws.mergeCells(i, 1, i, 5); ws.getRow(i).height = 30; ws.getCell(i, 1).alignment = { wrapText: true, vertical: 'middle' }; }

  ws = sheet(wb, 'Rincian', 'Rincian kelompok, subjek, dan kondisi', r, [34, 12, 26, 28, 12, 12]);
  const detail: (string | number)[][] = [];
  for (const g of r.groups) for (const s of g.subjects) for (const c of s.conditions)
    detail.push([`${g.name} (${g.group})`, s.code, s.label ?? '(belum ada arti resmi)', c.label ?? '(belum ada arti resmi)', c.code, c.n]);
  table(ws, 4, 'Jumlah NOTAM per kombinasi', ['Kelompok', 'Kode subjek', 'Subjek', 'Kondisi', 'Kode kondisi', 'Jumlah'], detail);

  ws = sheet(wb, 'Tren Jenis', `Tren per ${r.granularity === 'day' ? 'hari' : 'bulan'}`, r, [16, ...r.trend.keys.map(() => 22)]);
  table(ws, 4, 'Jumlah NOTAM per periode dan kelompok', ['Periode', ...r.trend.keys.map((k) => name(k, r))], r.trend.series.map((s) => [s.period, ...r.trend.keys.map((k) => s.counts[k] ?? 0)]));

  ws = sheet(wb, 'Bandara x Jenis', 'Bandara dan jenis NOTAM', r, [14, 34, ...r.matrix.groups.map(() => 18), 12]);
  table(ws, 4, '8 bandara teratas', ['Bandara', 'Nama', ...r.matrix.groups.map((g) => name(g, r)), 'Total'], r.matrix.rows.map((m) => [m.airport, m.name, ...r.matrix.groups.map((g) => m.counts[g] ?? 0), m.total]));

  ws = sheet(wb, 'Data', 'Data NOTAM', r, [18, 20, 11, 18, 18, 11, 30, 26, 26, 44, 56, 56]);
  const head = ws.getRow(4);
  ['Nomor Form', 'Tanggal Pengusulan', 'Bandara', 'Pengusul', 'Status', 'Kode Q', 'Kelompok', 'Subjek', 'Kondisi', 'Isi NOTAM (item E)', 'Notam Prompt', 'Notam Generated'].forEach((t, i) => {
    const c = head.getCell(i + 1);
    c.value = t; c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2545' } };
    c.alignment = { vertical: 'middle', wrapText: true };
  });
  head.height = 22;
  [...rows].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).forEach((d, i) => {
    const rr = ws.getRow(5 + i);
    rr.values = [d.formNo, new Date(d.createdAt), d.airport, d.originator, STATUS_ID[d.status] ?? d.status, d.qcode, name(d.group, r), subjectLabel(d.subject) ?? d.subject, conditionLabel(d.condition) ?? d.condition, d.text, d.prompt, d.full];
    rr.getCell(11).alignment = { wrapText: true, vertical: 'top' };
    rr.getCell(12).alignment = { wrapText: true, vertical: 'top' };
    rr.getCell(2).numFmt = 'dd mmm yyyy hh:mm';
  });
  ws.views = [{ showGridLines: false, state: 'frozen', ySplit: 4 }];
  if (rows.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + rows.length, column: 12 } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const PALETTE = [C.sky, C.amber, C.ok, C.bad, '8FB8E8', '7C6FD0', C.muted];

export async function typesToPptx(r: TypesReport): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = 'Laporan NOTAM menurut jenis';
  pptx.author = 'NOTAM AI Generator';
  const period = periodLabel(r);
  pptx.defineSlideMaster({
    title: 'KONTEN', background: { color: C.cloud },
    objects: [
      { rect: { x: 0, y: 0, w: SLIDE_W, h: 0.95, fill: { color: C.navy } } },
      { rect: { x: 0, y: 0.95, w: SLIDE_W, h: 0.05, fill: { color: C.amber } } },
      { text: { text: `NOTAM AI Generator · ${period}`, options: { x: 0.5, y: 7.05, w: 9.5, h: 0.3, fontSize: 10, color: C.muted, fontFace: FONT } } },
    ],
    slideNumber: { x: 12.1, y: 7.05, w: 0.7, h: 0.3, fontSize: 10, color: C.muted, fontFace: FONT, align: 'right' },
  });
  const content = (title: string) => {
    const s = pptx.addSlide({ masterName: 'KONTEN' });
    s.addText(title, { x: 0.5, y: 0.12, w: 12.3, h: 0.72, fontSize: 26, bold: true, color: C.white, fontFace: FONT, valign: 'middle' });
    return s;
  };
  const sub = (s: PptxGenJS.Slide, t: string, x: number, y: number, w: number) => s.addText(t, { x, y, w, h: 0.4, fontSize: 16, bold: true, color: C.navy, fontFace: FONT });
  const empty = (s: PptxGenJS.Slide, x: number, y: number, w: number, t = 'Tidak ada data') => s.addText(t, { x, y, w, h: 0.5, fontSize: 16, color: C.muted, fontFace: FONT, align: 'center' });
  const head = (text: string, opts: Partial<PptxGenJS.TableCellProps> = {}): PptxGenJS.TableCell => ({ text, options: { bold: true, color: C.white, fill: { color: C.navy }, fontFace: FONT, fontSize: 12, align: 'center', valign: 'middle', ...opts } });
  const cell = (text: string, opts: Partial<PptxGenJS.TableCellProps> = {}): PptxGenJS.TableCell => ({ text, options: { color: C.ink, fontFace: FONT, fontSize: 12, align: 'center', valign: 'middle', ...opts } });
  const tbl = { border: { type: 'solid' as const, pt: 0.75, color: C.line }, fill: { color: C.white } };

  { // sampul
    const s = pptx.addSlide();
    s.background = { color: C.navy };
    s.addShape(pptx.ShapeType.rect, { x: 0.8, y: 2.35, w: 0.12, h: 2.0, fill: { color: C.amber }, line: { color: C.amber, width: 0 } });
    s.addText('Laporan NOTAM menurut Jenis', { x: 1.2, y: 2.25, w: 11.4, h: 0.9, fontSize: 40, bold: true, color: C.white, fontFace: FONT });
    s.addText('Kelompok, subjek, dan kondisi berdasarkan kode Q', { x: 1.2, y: 3.15, w: 11, h: 0.6, fontSize: 22, color: 'BFD3EA', fontFace: FONT });
    s.addText(period, { x: 1.2, y: 3.85, w: 11, h: 0.5, fontSize: 18, color: C.white, fontFace: FONT });
    s.addText(`Dibuat otomatis oleh NOTAM AI Generator · ${new Date(r.period.generatedAt).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jakarta' })} WIB`, { x: 1.2, y: 6.6, w: 11, h: 0.4, fontSize: 12, color: '8FA9C9', fontFace: FONT });
  }
  { // ringkasan
    const s = content('Ringkasan');
    const tiles: [string, string][] = [[String(r.total), 'Total NOTAM'], [String(r.coded), 'Kode Q terbaca'], [String(r.groups.length), 'Kelompok jenis'], [r.groups[0] ? `${Math.round(r.groups[0].share * 100)}%` : '–', r.groups[0] ? r.groups[0].name : 'Jenis terbanyak']];
    tiles.forEach(([v, l], i) => {
      const x = 0.5 + i * 3.15;
      s.addShape(pptx.ShapeType.rect, { x, y: 1.3, w: 2.95, h: 1.3, fill: { color: C.white }, line: { color: C.line, width: 1 } });
      s.addShape(pptx.ShapeType.rect, { x, y: 1.3, w: 0.09, h: 1.3, fill: { color: PALETTE[i] }, line: { color: PALETTE[i], width: 0 } });
      s.addText(v, { x: x + 0.25, y: 1.4, w: 2.6, h: 0.75, fontSize: 30, bold: true, color: C.navy, fontFace: FONT, valign: 'middle' });
      s.addText(l, { x: x + 0.25, y: 2.1, w: 2.6, h: 0.45, fontSize: 12, color: C.muted, fontFace: FONT, valign: 'top' });
    });
    sub(s, 'Temuan utama', 0.5, 2.95, 12.3);
    s.addText(r.insights.map((t) => ({ text: t, options: { bullet: true, breakLine: true } })), { x: 0.5, y: 3.4, w: 12.3, h: 3.5, fontSize: 15, color: C.ink, fontFace: FONT, valign: 'top', paraSpaceAfter: 8 });
  }
  { // kelompok
    const s = content('Kelompok Jenis NOTAM');
    if (r.groups.length) {
      s.addChart(pptx.ChartType.doughnut, [{ name: 'Kelompok', labels: r.groups.map((g) => g.name), values: r.groups.map((g) => g.n) }], { x: 0.3, y: 1.3, w: 6.4, h: 5.6, holeSize: 55, chartColors: r.groups.map((_, i) => PALETTE[i % PALETTE.length]), showLegend: true, legendPos: 'b', legendFontSize: 11, showPercent: true, showValue: false, dataLabelColor: C.white, dataLabelFontSize: 11, dataLabelFontBold: true });
      const rows: PptxGenJS.TableRow[] = [[head('Kelompok', { align: 'left' }), head('Jumlah'), head('%'), head('Setuju'), head('Tolak')]];
      r.groups.slice(0, 9).forEach((g) => rows.push([cell(g.name, { align: 'left', bold: true }), cell(String(g.n)), cell(`${Math.round(g.share * 100)}%`), cell(String(g.approved)), cell(String(g.rejected))]));
      s.addTable(rows, { x: 6.9, y: 1.4, w: 5.9, colW: [2.9, 0.75, 0.75, 0.75, 0.75], rowH: 0.46, ...tbl });
    } else empty(s, 0.5, 3.5, 12.3);
  }
  { // subjek teratas
    const s = content('Subjek dan Kondisi Terbanyak');
    const subjects = r.groups.flatMap((g) => g.subjects.map((x) => ({ ...x, g: g.group }))).sort((a, b) => b.n - a.n).slice(0, 10);
    sub(s, 'Subjek teratas', 0.5, 1.2, 6);
    if (subjects.length) s.addChart(pptx.ChartType.bar, [{ name: 'Jumlah', labels: [...subjects].reverse().map((x) => (x.label ? `${x.label} (${x.code})` : x.code)), values: [...subjects].reverse().map((x) => x.n) }], { x: 0.4, y: 1.6, w: 6.4, h: 5.3, barDir: 'bar', valAxisHidden: true, valGridLine: { style: 'none' }, chartColors: [C.sky], showLegend: false, showValue: true, dataLabelFontSize: 12, dataLabelFontBold: true, catAxisLabelFontSize: 12, barGapWidthPct: 40 });
    else empty(s, 0.5, 3.5, 6);
    sub(s, 'Kondisi', 7.2, 1.2, 5.6);
    if (r.conditions.length) {
      const top = r.conditions.slice(0, 7);
      s.addChart(pptx.ChartType.doughnut, [{ name: 'Kondisi', labels: top.map((c) => c.label ?? c.code), values: top.map((c) => c.n) }], { x: 7.1, y: 1.6, w: 5.8, h: 5.3, holeSize: 55, chartColors: top.map((_, i) => PALETTE[i % PALETTE.length]), showLegend: true, legendPos: 'b', legendFontSize: 11, showPercent: true, showValue: false, dataLabelColor: C.white, dataLabelFontSize: 11, dataLabelFontBold: true });
    } else empty(s, 7.2, 3.5, 5.6);
  }
  { // tren
    const s = content(`Tren per ${r.granularity === 'day' ? 'Hari' : 'Bulan'} menurut Kelompok`);
    if (r.trend.series.length) {
      const labels = r.trend.series.map((x) => (r.granularity === 'day' ? `${x.period.slice(8)}/${x.period.slice(5, 7)}` : x.period));
      s.addChart(pptx.ChartType.bar, r.trend.keys.map((k) => ({ name: name(k, r), labels, values: r.trend.series.map((x) => x.counts[k] ?? 0) })), { x: 0.5, y: 1.3, w: 12.3, h: 5.6, barDir: 'col', barGrouping: 'stacked', chartColors: r.trend.keys.map((_, i) => PALETTE[i % PALETTE.length]), showLegend: true, legendPos: 'b', legendFontSize: 12, catAxisLabelFontSize: 11, catAxisLabelFrequency: String(Math.max(1, Math.ceil(r.trend.series.length / 14))), valAxisMinVal: 0, valGridLine: { color: C.line, size: 0.5 }, barGapWidthPct: 35 });
    } else empty(s, 0.5, 3.5, 12.3);
  }
  { // bandara x jenis
    const s = content('Bandara dan Jenis NOTAM');
    if (r.matrix.rows.length) {
      const cols = r.matrix.groups;
      const rows: PptxGenJS.TableRow[] = [[head('Bandara', { align: 'left' }), ...cols.map((g) => head(name(g, r), { fontSize: 10 })), head('Total')]];
      r.matrix.rows.forEach((m) => rows.push([cell(`${m.airport}${m.name ? ` · ${m.name}` : ''}`, { align: 'left', bold: true, fontSize: 11 }), ...cols.map((g) => cell(String(m.counts[g] ?? 0))), cell(String(m.total), { bold: true })]));
      const w = 12.3, first = 3.6, last = 0.9, each = (w - first - last) / Math.max(1, cols.length);
      s.addTable(rows, { x: 0.5, y: 1.4, w, colW: [first, ...cols.map(() => each), last], rowH: 0.5, ...tbl });
    } else empty(s, 0.5, 3.5, 12.3);
  }
  { // catatan
    const s = content('Catatan dan Definisi');
    const lines = [
      'Jenis NOTAM dibaca dari kode Q pada hasil susunan terakhir: huruf pertama setelah Q menentukan kelompok, dua huruf pertama subjek, dua huruf terakhir kondisi.',
      'Kode Q berasal dari susunan AI dan belum tentu dikoreksi peninjau. Ketepatan kode Q masih menjadi kelemahan sistem.',
      'Arti subjek dan kondisi disimpulkan dari contoh item E pada dataset, bukan tabel resmi AirNav; kode yang contohnya tidak tegas ditampilkan apa adanya.',
      'Nama kelompok mengikuti pengelompokan kode Q ICAO.',
      'Draft tidak dihitung. Persentase dihitung dari NOTAM yang kode Q-nya terbaca.',
    ];
    s.addText(lines.map((t) => ({ text: t, options: { bullet: true, breakLine: true } })), { x: 0.6, y: 1.3, w: 12.1, h: 5.6, fontSize: 16, color: C.ink, fontFace: FONT, valign: 'top', paraSpaceAfter: 10 });
  }
  return (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
}
