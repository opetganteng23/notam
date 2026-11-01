import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { NotamRequest } from './schemas';

const last = (r: NotamRequest) => r.versions[r.versions.length - 1];

export async function toExcel(rows: NotamRequest[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('NOTAM');
  ws.columns = [
    { header: 'No', key: 'no', width: 6 },
    { header: 'Nomor Form', key: 'formNo', width: 18 },
    { header: 'Tanggal Pengusulan', key: 'createdAt', width: 22 },
    { header: 'Bandara', key: 'airport', width: 10 },
    { header: 'Pengusul', key: 'originator', width: 16 },
    { header: 'Status', key: 'status', width: 18 },
    { header: 'Notam Prompt', key: 'prompt', width: 60 },
    { header: 'Notam Generated', key: 'generated', width: 60 },
    { header: 'Validasi', key: 'validation', width: 12 },
  ];
  rows.forEach((r, i) =>
    ws.addRow({
      no: i + 1,
      formNo: r.formNo,
      createdAt: (r as any).createdAt?.toISOString?.() ?? '',
      airport: r.airport,
      originator: r.originator,
      status: r.status,
      prompt: last(r).freeText,
      generated: last(r).generated,
      validation: last(r).validation?.status ?? '',
    }),
  );
  ws.getRow(1).font = { bold: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Surat pengajuan. Bukan bukti publikasi resmi; menampilkan siapa yang mengetahui (ATS/PIA yang pernah ACCEPT).
export function toPdf(r: NotamRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const v = last(r);
    const knownBy = (role: string) => r.events.filter((e) => e.role === role && e.action === 'ACCEPT').map((e) => e.actor).join(', ') || '-';
    doc.fontSize(16).text('Pengajuan NOTAM', { align: 'center' }).moveDown();
    doc.fontSize(11)
      .text(`Nomor Form : ${r.formNo}`)
      .text(`Tanggal Pengusulan : ${(r as any).createdAt?.toISOString?.().slice(0, 10) ?? '-'}`)
      .text(`Bandara : ${r.airport}`)
      .text(`Pemohon (Originator) : ${r.originator}`)
      .text(`Status : ${r.status}`)
      .moveDown()
      .text('Pesan asli:', { underline: true })
      .text(v.freeText)
      .moveDown()
      .text(`Draf NOTAM (versi ${v.no}):`, { underline: true })
      .font('Courier').text(v.generated).font('Helvetica')
      .moveDown(2)
      .text(`Mengetahui ATS : ${knownBy('ATS')}`)
      .text(`Mengetahui PIA : ${knownBy('PIA')}`)
      .moveDown()
      .fontSize(9).text('Dokumen ini bukan bukti penerbitan NOTAM resmi.');
    doc.end();
  });
}
