import * as bcrypt from 'bcryptjs';
import { connect, connection } from 'mongoose';

// Membuat satu user per role (termasuk admin). Contoh: SEED_PASSWORD=... MONGO_URI=... npm run seed
async function seed() {
  const { MONGO_URI, SEED_PASSWORD } = process.env;
  if (!MONGO_URI || !SEED_PASSWORD) throw new Error('MONGO_URI dan SEED_PASSWORD wajib diset');
  await connect(MONGO_URI);
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  for (const role of ['ORIGINATOR', 'ATS', 'PIA', 'NOF', 'ADMIN']) {
    const username = role.toLowerCase();
    await connection.collection('users').updateOne({ username }, { $setOnInsert: { username, role, passwordHash, active: true, createdAt: new Date(), updatedAt: new Date() } }, { upsert: true });
  }
  await connection.close();
}
seed();
