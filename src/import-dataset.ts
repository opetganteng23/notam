import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createConnection } from 'mongoose';
import { validateNotam } from './generator/validator';

// Memasukkan NOTAM dari dataset (data/examples.json) sebagai arsip berstatus "Disetujui NOF".
// Tidak memiliki event SUBMIT, sehingga tidak ikut dihitung di analytics alur kerja.
// Aman dijalankan ulang: nomor ARSIP-xxxxx yang sudah ada dilewati.
export const ARCHIVE_USER = 'arsip-dataset';

const parseB = (n: string): Date => {
  const m = /^B\)\s*(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/m.exec(n);
  return m ? new Date(Date.UTC(2000 + +m[1], +m[2] - 1, +m[3], +m[4], +m[5])) : new Date();
};

export async function importDataset(uri: string, file = join(__dirname, '..', 'data', 'examples.json')) {
  const rows: { freeText: string; notam: string }[] = JSON.parse(readFileSync(file, 'utf-8'));
  const conn = await createConnection(uri).asPromise();
  try {
    const col = conn.db!.collection('notamrequests');
    let added = 0, skipped = 0;
    const docs = [];
    for (let i = 0; i < rows.length; i++) {
      const { freeText, notam } = rows[i];
      const formNo = `ARSIP-${String(i + 1).padStart(5, '0')}`;
      const airport = /^A\)\s*([A-Z]{4})/m.exec(notam)?.[1];
      if (!airport) { skipped++; continue; }
      const at = parseB(notam);
      const v = validateNotam(notam, airport, freeText);
      docs.push({
        formNo, airport, originator: ARCHIVE_USER, status: 'APPROVED_BY_NOF', piaRevisionCount: 0, createdAt: at, updatedAt: at,
        versions: [{ no: 1, freeText, generated: notam, provider: 'dataset', corrections: [], validation: v, createdAt: at }],
        events: [{ actor: ARCHIVE_USER, role: 'ADMIN', action: 'IMPORT', from: 'DRAFT', to: 'APPROVED_BY_NOF', note: 'Arsip dari dataset NOTAM', at }],
      });
    }
    for (const d of docs) {
      if (await col.countDocuments({ formNo: d.formNo }, { limit: 1 })) { skipped++; continue; }
      await col.insertOne(d);
      added++;
    }
    await conn.db!.collection('auditlogs').insertOne({ at: new Date(), actor: 'cli', action: 'DATASET_IMPORT', target: 'notamrequests', summary: `Impor arsip dataset: ${added} ditambahkan, ${skipped} dilewati`, detail: { added, skipped } });
    return { added, skipped, total: rows.length };
  } finally {
    await conn.close();
  }
}

if (require.main === module) {
  importDataset(process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/notam').then((r) => console.log(r), (e) => { console.error(e.message); process.exit(1); });
}
