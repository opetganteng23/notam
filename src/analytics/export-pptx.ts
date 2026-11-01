import PptxGenJS from 'pptxgenjs';
import { Analytics, STALE_HOURS, fmtDuration } from './analytics';
import { STATUS_ID, periodLabel } from './export-xlsx';

export const SLIDE_W = 13.333;
export const SLIDE_H = 7.5;

export const C = { navy: '0B2545', sky: '1769C2', skyLight: '5AA2E6', skySoft: 'EAF2FB', amber: 'F2A900', ok: '17784F', bad: 'B83232', muted: '66758A', ink: '0F1C2E', cloud: 'F5F7FA', line: 'DBE5F1', white: 'FFFFFF' };
export const FONT = 'Calibri';
const pct = (r: number | null) => (r === null ? '–' : `${Math.round(r * 100)}%`);
const num = (n: number | null, d = 1) => (n === null ? '–' : n.toFixed(d).replace('.', ','));
const STATUS_COLOR: Record<string, string> = { APPROVED_BY_NOF: C.ok, REJECTED: C.bad, REVISION_REQUIRED: C.amber, UNDER_ATS: C.sky, UNDER_PIA: C.skyLight, UNDER_NOF: '8FB8E8' };

// Membuat deck eksekutif 16:9 dengan grafik native (dapat diedit di PowerPoint).
export async function analyticsToPptx(a: Analytics): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = 'Ringkasan Eksekutif NOTAM';
  pptx.author = 'NOTAM AI Generator';
  const period = periodLabel(a);
  const k = a.kpi;

  pptx.defineSlideMaster({
    title: 'KONTEN',
    background: { color: C.cloud },
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
  const tile = (s: PptxGenJS.Slide, x: number, y: number, w: number, h: number, value: string, label: string, color: string) => {
    s.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: C.white }, line: { color: C.line, width: 1 } });
    s.addShape(pptx.ShapeType.rect, { x, y, w: 0.09, h, fill: { color }, line: { color, width: 0 } });
    s.addText(value, { x: x + 0.25, y: y + 0.1, w: w - 0.35, h: h * 0.56, fontSize: 30, bold: true, color: C.navy, fontFace: FONT, valign: 'middle' });
    s.addText(label, { x: x + 0.25, y: y + h * 0.62, w: w - 0.35, h: h * 0.32, fontSize: 12, color: C.muted, fontFace: FONT, valign: 'top' });
  };
  const note = (s: PptxGenJS.Slide, text: string, x = 0.5, y = 3.2, w = 12.3) =>
    s.addText(text, { x, y, w, h: 0.5, fontSize: 16, color: C.muted, fontFace: FONT, align: 'center' });
  const head = (text: string, opts: Partial<PptxGenJS.TableCellProps> = {}): PptxGenJS.TableCell => ({ text, options: { bold: true, color: C.white, fill: { color: C.navy }, fontFace: FONT, fontSize: 12, align: 'center', valign: 'middle', ...opts } });
  const cell = (text: string, opts: Partial<PptxGenJS.TableCellProps> = {}): PptxGenJS.TableCell => ({ text, options: { color: C.ink, fontFace: FONT, fontSize: 12, align: 'center', valign: 'middle', ...opts } });
  const tableOpts = { border: { type: 'solid' as const, pt: 0.75, color: C.line }, fill: { color: C.white } };

  // 1. Sampul
  {
    const s = pptx.addSlide();
    s.background = { color: C.navy };
    s.addShape(pptx.ShapeType.rect, { x: 0.8, y: 2.35, w: 0.12, h: 2.0, fill: { color: C.amber }, line: { color: C.amber, width: 0 } });
    s.addText('Ringkasan Eksekutif', { x: 1.2, y: 2.25, w: 11, h: 0.9, fontSize: 44, bold: true, color: C.white, fontFace: FONT });
    s.addText('Analitik Pengajuan NOTAM', { x: 1.2, y: 3.15, w: 11, h: 0.6, fontSize: 26, color: 'BFD3EA', fontFace: FONT });
    s.addText(period, { x: 1.2, y: 3.85, w: 11, h: 0.5, fontSize: 18, color: C.white, fontFace: FONT });
    s.addText(`Dibuat otomatis oleh NOTAM AI Generator · ${new Date(a.period.generatedAt).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jakarta' })} WIB`, { x: 1.2, y: 6.6, w: 11, h: 0.4, fontSize: 12, color: '8FA9C9', fontFace: FONT });
  }

  // 2. Ringkasan: 8 tile + 4 temuan
  {
    const s = content('Ringkasan Eksekutif');
    const tiles: [string, string, string][] = [
      [String(k.total), 'Total pengajuan', C.sky],
      [String(k.approved), 'Disetujui NOF', C.ok],
      [String(k.rejected), 'Ditolak', C.bad],
      [String(k.inReview + k.needsRevision), 'Masih berjalan (review + revisi)', C.amber],
      [pct(k.approvalRate), 'Tingkat persetujuan', C.ok],
      [pct(k.firstPassRate), 'Disetujui tanpa revisi', C.ok],
      [fmtDuration(k.avgTurnaroundH), 'Rata-rata waktu penyelesaian', C.sky],
      [String(k.pendingOver24h), `Menunggu > ${STALE_HOURS} jam`, k.pendingOver24h ? C.bad : C.ok],
    ];
    tiles.forEach(([v, l, c], i) => tile(s, 0.5 + (i % 4) * 3.15, 1.3 + Math.floor(i / 4) * 1.5, 2.95, 1.3, v, l, c));
    s.addText('Temuan utama', { x: 0.5, y: 4.4, w: 12.3, h: 0.4, fontSize: 16, bold: true, color: C.navy, fontFace: FONT });
    s.addText(a.insights.slice(0, 4).map((t) => ({ text: t, options: { bullet: true, breakLine: true } })), { x: 0.5, y: 4.8, w: 12.3, h: 2.1, fontSize: 13, color: C.ink, fontFace: FONT, valign: 'top', paraSpaceAfter: 4 });
  }

  // 3. Temuan lengkap
  {
    const s = content('Temuan Utama');
    s.addText(a.insights.map((t) => ({ text: t, options: { bullet: true, breakLine: true } })), { x: 0.6, y: 1.3, w: 12.1, h: 5.6, fontSize: 16, color: C.ink, fontFace: FONT, valign: 'top', paraSpaceAfter: 8 });
  }

  // 4. Status & funnel
  {
    const s = content('Status dan Alur Persetujuan');
    const st = Object.entries(a.status).filter(([, n]) => n > 0);
    s.addText('Status saat ini', { x: 0.5, y: 1.2, w: 6, h: 0.4, fontSize: 16, bold: true, color: C.navy, fontFace: FONT });
    if (st.length) s.addChart(pptx.ChartType.doughnut, [{ name: 'Status', labels: st.map(([x]) => STATUS_ID[x] ?? x), values: st.map(([, n]) => n) }], { x: 0.4, y: 1.6, w: 6.2, h: 5.2, holeSize: 55, chartColors: st.map(([x]) => STATUS_COLOR[x] ?? C.muted), showLegend: true, legendPos: 'r', legendFontSize: 13, legendFontFace: FONT, showPercent: true, showValue: false, dataLabelColor: C.white, dataLabelFontSize: 12, dataLabelFontBold: true });
    else note(s, 'Tidak ada data', 0.5, 3.6, 6);
    s.addText('Funnel persetujuan', { x: 7, y: 1.2, w: 5.8, h: 0.4, fontSize: 16, bold: true, color: C.navy, fontFace: FONT });
    if (a.funnel[0].n) s.addChart(pptx.ChartType.bar, [{ name: 'Pengajuan', labels: [...a.funnel].reverse().map((f) => f.label), values: [...a.funnel].reverse().map((f) => f.n) }], { x: 6.9, y: 1.6, w: 6, h: 5.2, barDir: 'bar', valAxisHidden: true, valGridLine: { style: 'none' }, chartColors: [C.sky], showLegend: false, showValue: true, dataLabelFontSize: 13, dataLabelFontBold: true, dataLabelColor: C.ink, catAxisLabelFontSize: 13, catAxisLabelFontFace: FONT, barGapWidthPct: 45 });
    else note(s, 'Tidak ada data', 7, 3.6, 5.8);
  }

  // 5. Tren
  {
    const s = content(`Tren Pengajuan per ${a.granularity === 'day' ? 'Hari' : 'Bulan'}`);
    if (a.series.length) {
      const labels = a.series.map((x) => (a.granularity === 'day' ? `${x.period.slice(8)}/${x.period.slice(5, 7)}` : x.period));
      s.addChart(pptx.ChartType.line, [{ name: 'Diajukan', labels, values: a.series.map((x) => x.submitted) }, { name: 'Disetujui', labels, values: a.series.map((x) => x.approved) }], { x: 0.5, y: 1.3, w: 12.3, h: 5.5, chartColors: [C.sky, C.ok], lineSize: 3, lineDataSymbolSize: a.series.length > 31 ? 4 : 8, showLegend: true, legendPos: 'b', legendFontSize: 13, legendFontFace: FONT, valAxisMinVal: 0, valAxisLabelFontSize: 12, catAxisLabelFontSize: 11, catAxisLabelFrequency: String(Math.max(1, Math.ceil(a.series.length / 14))), valGridLine: { color: C.line, size: 0.5 }, catGridLine: { style: 'none' } });
    } else note(s, 'Tidak ada data pada periode ini', 0.5, 3.4);
  }

  // 6. Kinerja tahapan
  {
    const s = content('Kinerja Tahapan');
    s.addText('Rata-rata lama tinggal per tahap (jam)', { x: 0.5, y: 1.2, w: 6, h: 0.4, fontSize: 16, bold: true, color: C.navy, fontFace: FONT });
    const has = a.stages.some((x) => x.avgH !== null);
    if (has) s.addChart(pptx.ChartType.bar, [{ name: 'Jam', labels: [...a.stages].reverse().map((x) => x.stage), values: [...a.stages].reverse().map((x) => Math.round((x.avgH ?? 0) * 10) / 10) }], { x: 0.4, y: 1.6, w: 5.6, h: 5.2, barDir: 'bar', valAxisHidden: true, valGridLine: { style: 'none' }, chartColors: [C.sky], showLegend: false, showValue: true, dataLabelFormatCode: '0.0', dataLabelFontSize: 13, dataLabelFontBold: true, catAxisLabelFontSize: 13, barGapWidthPct: 45 });
    else note(s, 'Belum ada tahap yang selesai', 0.5, 3.6, 5.6);
    s.addText('Rincian dan antrean saat ini', { x: 6.4, y: 1.2, w: 6.4, h: 0.4, fontSize: 16, bold: true, color: C.navy, fontFace: FONT });
    const rows: PptxGenJS.TableRow[] = [[head('Tahap', { align: 'left' }), head('Sampel'), head('Rata-rata'), head('Terlama'), head('Antre'), head(`> ${STALE_HOURS} jam`)]];
    a.stages.forEach((x, i) => {
      const p = a.pending[i];
      rows.push([cell(x.stage, { align: 'left', bold: true }), cell(String(x.n)), cell(fmtDuration(x.avgH)), cell(fmtDuration(x.maxH)), cell(String(p.n)), cell(String(p.over24h), { color: p.over24h ? C.bad : C.ink, bold: p.over24h > 0 })]);
    });
    s.addTable(rows, { x: 6.4, y: 1.7, w: 6.4, colW: [1.8, 0.8, 1.1, 1.1, 0.8, 0.8], rowH: 0.5, ...tableOpts });
    s.addText('Sampel = jumlah tahap yang sudah selesai dihitung. Antre = pengajuan yang sedang berada di tahap itu.', { x: 6.4, y: 4.4, w: 6.4, h: 0.7, fontSize: 11, color: C.muted, fontFace: FONT, valign: 'top' });
  }

  // 7. Bandara & jenis
  {
    const s = content('Bandara dan Jenis NOTAM');
    s.addText('Bandara teratas', { x: 0.5, y: 1.2, w: 6, h: 0.4, fontSize: 16, bold: true, color: C.navy, fontFace: FONT });
    if (a.airports.length) s.addChart(pptx.ChartType.bar, [{ name: 'Pengajuan', labels: [...a.airports].reverse().map((x) => x.airport), values: [...a.airports].reverse().map((x) => x.n) }], { x: 0.4, y: 1.6, w: 5.8, h: 5.2, barDir: 'bar', valAxisHidden: true, valGridLine: { style: 'none' }, chartColors: [C.sky], showLegend: false, showValue: true, dataLabelFontSize: 12, dataLabelFontBold: true, catAxisLabelFontSize: 12, barGapWidthPct: 40 });
    else note(s, 'Tidak ada data', 0.5, 3.6, 5.8);
    s.addText('Kode Q teratas', { x: 6.6, y: 1.2, w: 6.2, h: 0.4, fontSize: 16, bold: true, color: C.navy, fontFace: FONT });
    const rows: PptxGenJS.TableRow[] = [[head('Kode Q'), head('Arti', { align: 'left' }), head('Jumlah')]];
    a.qcodes.slice(0, 8).forEach((q) => rows.push([cell(q.code, { bold: true }), cell(q.label, { align: 'left' }), cell(String(q.n))]));
    if (!a.qcodes.length) rows.push([cell('–'), cell('Tidak ada data', { align: 'left' }), cell('–')]);
    s.addTable(rows, { x: 6.6, y: 1.7, w: 6.2, colW: [1.4, 3.8, 1.0], rowH: 0.45, ...tableOpts });
    s.addText('Arti kode Q hanya untuk kode yang dikenali; kode lain ditampilkan apa adanya.', { x: 6.6, y: 6.2, w: 6.2, h: 0.5, fontSize: 11, color: C.muted, fontFace: FONT, valign: 'top' });
  }

  // 8. Kualitas AI
  {
    const s = content('Kualitas Hasil AI');
    const v = a.ai.validation;
    const items: [string, string, string][] = [['Lolos', 'passed', C.ok], ['Peringatan', 'warning', C.amber], ['Gagal', 'failed', C.bad]];
    const present = items.filter(([, key]) => (v[key] ?? 0) > 0);
    s.addText('Hasil validasi (versi terakhir)', { x: 0.5, y: 1.2, w: 6, h: 0.4, fontSize: 16, bold: true, color: C.navy, fontFace: FONT });
    if (present.length) s.addChart(pptx.ChartType.doughnut, [{ name: 'Validasi', labels: present.map(([l]) => l), values: present.map(([, key]) => v[key]) }], { x: 0.4, y: 1.6, w: 6, h: 5.2, holeSize: 55, chartColors: present.map(([, , c]) => c), showLegend: true, legendPos: 'r', legendFontSize: 13, showPercent: true, showValue: false, dataLabelColor: C.white, dataLabelFontSize: 12, dataLabelFontBold: true });
    else note(s, 'Tidak ada data', 0.5, 3.6, 6);
    const t: [string, string, string][] = [
      [pct(k.aiPassRate), 'Langsung lolos validasi', C.ok],
      [pct(k.correctedRate), 'Dikoreksi otomatis oleh sistem', C.sky],
      [pct(k.regenRate), 'Dibuat ulang (lebih dari 1 versi)', C.amber],
      [k.avgGenSec === null ? '–' : `${num(k.avgGenSec)} dtk`, 'Rata-rata waktu generate', C.sky],
    ];
    t.forEach(([val, l, c], i) => tile(s, 6.9 + (i % 2) * 3.0, 1.7 + Math.floor(i / 2) * 1.6, 2.8, 1.4, val, l, c));
    s.addText(`Penyedia LLM: ${a.ai.providers.map((p) => `${p.provider} (${p.n})`).join(', ') || '–'}`, { x: 6.9, y: 5.1, w: 5.8, h: 0.5, fontSize: 13, color: C.muted, fontFace: FONT });
    s.addText('Lolos validasi berarti format dan aturan deterministik terpenuhi; isi E) tetap ditinjau manusia.', { x: 6.9, y: 5.6, w: 5.8, h: 0.8, fontSize: 12, color: C.muted, fontFace: FONT, valign: 'top' });
  }

  // 9. Pengusul & pengembalian
  {
    const s = content('Pengusul dan Pengembalian');
    s.addText('Pengusul teratas', { x: 0.5, y: 1.2, w: 6.5, h: 0.4, fontSize: 16, bold: true, color: C.navy, fontFace: FONT });
    const rows: PptxGenJS.TableRow[] = [[head('Pengusul', { align: 'left' }), head('Pengajuan'), head('Disetujui'), head('Ditolak'), head('Persetujuan')]];
    a.originators.slice(0, 8).forEach((o) => rows.push([cell(o.originator, { align: 'left', bold: true }), cell(String(o.n)), cell(String(o.approved)), cell(String(o.rejected)), cell(pct(o.approvalRate))]));
    if (!a.originators.length) rows.push([cell('Tidak ada data', { align: 'left' }), cell('–'), cell('–'), cell('–'), cell('–')]);
    s.addTable(rows, { x: 0.5, y: 1.7, w: 6.6, colW: [2.2, 1.1, 1.1, 1.0, 1.2], rowH: 0.45, ...tableOpts });
    s.addText('Pengembalian per role', { x: 7.5, y: 1.2, w: 5.3, h: 0.4, fontSize: 16, bold: true, color: C.navy, fontFace: FONT });
    if (a.returns.length) s.addChart(pptx.ChartType.bar, [{ name: 'Revisi', labels: a.returns.map((r) => r.role), values: a.returns.map((r) => r.revise) }, { name: 'Tolak', labels: a.returns.map((r) => r.role), values: a.returns.map((r) => r.reject) }], { x: 7.4, y: 1.6, w: 5.4, h: 5.2, barDir: 'col', barGrouping: 'stacked', chartColors: [C.amber, C.bad], showLegend: true, legendPos: 'b', legendFontSize: 13, showValue: true, dataLabelFontSize: 12, dataLabelColor: C.ink, catAxisLabelFontSize: 13, valAxisMinVal: 0, valGridLine: { color: C.line, size: 0.5 }, barGapWidthPct: 60 });
    else note(s, 'Tidak ada pengembalian pada periode ini', 7.5, 3.6, 5.3);
  }

  // 10. Catatan
  {
    const s = content('Catatan dan Definisi');
    const lines = [
      'Cakupan: pengajuan yang sudah disubmit dalam periode; Draft tidak dihitung.',
      'Tingkat persetujuan = disetujui ÷ (disetujui + ditolak). Pengajuan yang masih berjalan tidak ikut dihitung.',
      'Waktu penyelesaian = dari submit pertama hingga disetujui NOF, termasuk waktu menunggu revisi Originator.',
      'Lama tinggal per tahap dihitung hanya dari tahap yang sudah selesai; antrean saat ini dilaporkan terpisah.',
      'Disetujui tanpa revisi = disetujui tanpa satu pun aksi Revisi atau Reject sepanjang alur.',
      'Validasi AI mengukur kepatuhan format dan aturan deterministik, bukan kebenaran isi E).',
      'Arti kode Q ditampilkan hanya untuk kode yang dikenali; tabel Q-code resmi AirNav belum tersedia.',
      'Data berasal dari catatan aplikasi dan mengikuti zona waktu UTC untuk pengelompokan harian/bulanan.',
    ];
    s.addText(lines.map((t) => ({ text: t, options: { bullet: true, breakLine: true } })), { x: 0.6, y: 1.3, w: 12.1, h: 5.6, fontSize: 15, color: C.ink, fontFace: FONT, valign: 'top', paraSpaceAfter: 8 });
  }

  return (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
}
