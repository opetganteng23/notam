import { Controller, Get, StreamableFile } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { table } from '../analytics/export-xlsx';
import { DictCategory, buildDictionary } from './dictionary';

const SHEET: Record<string, string> = { bandara: 'Bandara', fir: 'FIR', qcode: 'Kode Q', singkatan: 'Singkatan', istilah: 'Istilah', item: 'Item NOTAM', waktu: 'Waktu', aplikasi: 'Aplikasi', pelabelan: 'Pelabelan' };

async function toExcel(cats: DictCategory[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NOTAM AI Generator';
  for (const c of cats) {
    const ws = wb.addWorksheet(SHEET[c.id] ?? c.title, { views: [{ showGridLines: false }] });
    const cols = Math.max(...c.tables.map((t) => t.columns.length));
    for (let i = 1; i <= cols; i++) ws.getColumn(i).width = i === 1 ? 24 : 40;
    ws.getCell('A1').value = `Kamus: ${c.title}`;
    ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF0B2545' } };
    ws.getCell('A2').value = `${c.summary} Sumber: ${c.source}.`;
    ws.getCell('A2').font = { italic: true, color: { argb: 'FF66758A' } };
    let row = 4;
    for (const t of c.tables) {
      row = table(ws, row, t.note ? `${t.title} (${t.note})` : t.title, t.columns.map((k) => k.label), t.rows.map((r) => t.columns.map((k) => r[k.key] ?? '')));
      row++;
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Kamus rujukan: dapat dibaca semua pengguna yang sudah login.
@Controller('dictionary')
export class DictionaryController {
  @Get()
  get() {
    return buildDictionary();
  }

  @Get('export.xlsx')
  async xlsx() {
    return new StreamableFile(await toExcel(buildDictionary()), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="kamus-notam.xlsx"',
    });
  }
}
