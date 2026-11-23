import { connect, connection } from 'mongoose';
import { cleanAirports } from './auth/scope';
import { findAirport } from './master/airports';

// Mengatur cakupan bandara akun yang sudah ada. Kosongkan NEW_AIRPORTS untuk mencabut batas.
// Contoh: NEW_USERNAME=ats.jatsc NEW_AIRPORTS=WIII npm run set-airports
async function main() {
  const { MONGO_URI, NEW_USERNAME: username, NEW_AIRPORTS } = process.env;
  if (!MONGO_URI || !username) throw new Error('MONGO_URI dan NEW_USERNAME wajib diset');
  const airports = cleanAirports(NEW_AIRPORTS, (l) => !!findAirport(l));
  await connect(MONGO_URI);
  try {
    const users = connection.collection('users');
    const before = await users.findOne({ username });
    if (!before) throw new Error(`Akun ${username} tidak ditemukan`);
    await users.updateOne({ username }, { $set: { airports, updatedAt: new Date() } });
    await connection.collection('auditlogs').insertOne({ at: new Date(), actor: 'cli', action: 'USER_UPDATE', target: username, summary: `Mengubah akun ${username}: bandara ${(before.airports ?? []).join(',') || '(semua)'} → ${airports.join(',') || '(semua)'}`, detail: { airports: { from: before.airports ?? [], to: airports } } });
    console.log(`Akun ${username}: bandara ${airports.join(',') || '(semua)'}.`);
  } finally {
    await connection.close();
  }
}

main().catch((e) => {
  console.error(`Gagal: ${e.message}`);
  process.exitCode = 1;
});
