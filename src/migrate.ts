import { createConnection } from 'mongoose';

// Koleksi data nyata yang dipindahkan. Audit log tidak ikut kecuali diminta (INCLUDE_AUDIT=1),
// karena pada database lama berisi jejak pengujian. Sumber tidak pernah diubah atau dihapus.
const DATA = ['users', 'notamrequests', 'settings'];

export interface MigrateOptions { uri: string; newDb: string; includeAudit?: boolean }
export interface MigrateResult { from: string; to: string; copied: Record<string, number> }

export async function migrate(o: MigrateOptions): Promise<MigrateResult> {
  if (!/^[A-Za-z0-9_-]{1,38}$/.test(o.newDb)) throw new Error('NEW_DB harus 1-38 karakter: huruf, angka, minus, garis bawah');
  const conn = await createConnection(o.uri).asPromise();
  try {
    const src = conn.db!;
    if (src.databaseName === o.newDb) throw new Error('Database tujuan harus berbeda dari database sumber');
    const dst = conn.useDb(o.newDb, { useCache: false }).db!;
    const names = o.includeAudit ? [...DATA, 'auditlogs'] : DATA;

    // Tujuan harus kosong agar migrasi tidak mencampur data.
    for (const n of names) {
      if ((await dst.collection(n).countDocuments()) > 0) throw new Error(`Database tujuan "${o.newDb}" sudah berisi data di koleksi ${n}; migrasi dibatalkan`);
    }

    const copied: Record<string, number> = {};
    for (const n of names) {
      const docs = await src.collection(n).find({}).toArray();
      if (docs.length) await dst.collection(n).insertMany(docs);
      const count = await dst.collection(n).countDocuments();
      if (count !== docs.length) throw new Error(`Jumlah ${n} tidak cocok setelah disalin (${count} dari ${docs.length}); periksa database tujuan`);
      copied[n] = count;
    }

    await dst.collection('auditlogs').insertOne({
      at: new Date(), actor: 'cli', action: 'SERVER_MIGRATE', target: o.newDb,
      summary: `Data dipindahkan dari database "${src.databaseName}" ke "${o.newDb}" (${Object.entries(copied).map(([k, v]) => `${k}: ${v}`).join(', ')})`,
      detail: copied,
    });
    return { from: src.databaseName, to: o.newDb, copied };
  } finally {
    await conn.close();
  }
}

// Contoh: NEW_DB=notam_prod npm run migrate   (sumber = database pada MONGO_URI)
if (require.main === module) {
  const { MONGO_URI, NEW_DB, INCLUDE_AUDIT } = process.env;
  if (!MONGO_URI || !NEW_DB) {
    console.error('Gagal: MONGO_URI dan NEW_DB wajib diset');
    process.exit(1);
  }
  migrate({ uri: MONGO_URI, newDb: NEW_DB, includeAudit: INCLUDE_AUDIT === '1' })
    .then((r) => {
      console.log(`Selesai: "${r.from}" -> "${r.to}"`);
      for (const [k, v] of Object.entries(r.copied)) console.log(`  ${k}: ${v}`);
      console.log(`Database lama "${r.from}" tidak diubah (arsip). Ganti MONGO_URI ke .../${r.to} lalu restart backend.`);
    })
    .catch((e) => {
      console.error(`Gagal: ${e.message}`);
      process.exit(1);
    });
}
