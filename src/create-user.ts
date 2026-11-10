import * as bcrypt from 'bcryptjs';
import { connect, connection } from 'mongoose';
import { MIN_PASSWORD, USERNAME_HINT, USERNAME_RE, normalizeUsername } from './users/rules';

const ROLES = ['ORIGINATOR', 'ATS', 'PIA', 'NOF', 'ADMIN'];

// Membuat satu akun tanpa menaruh password di file/riwayat perintah.
// PowerShell: $env:NEW_USERNAME='a@b.id'; $env:NEW_PASSWORD='...'; npm run create-user
// Tidak mengubah akun yang sudah ada.
async function main() {
  const { MONGO_URI, NEW_USERNAME: rawUsername, NEW_PASSWORD: password, NEW_ROLE: role = 'ADMIN' } = process.env;
  const username = normalizeUsername(rawUsername);
  if (!MONGO_URI || !username || !password) throw new Error('MONGO_URI, NEW_USERNAME, dan NEW_PASSWORD wajib diset');
  if (!USERNAME_RE.test(username)) throw new Error(USERNAME_HINT);
  if (password.length < MIN_PASSWORD) throw new Error(`Password minimal ${MIN_PASSWORD} karakter`);
  if (!ROLES.includes(role)) throw new Error(`NEW_ROLE harus salah satu dari ${ROLES.join(', ')}`);

  await connect(MONGO_URI);
  try {
    const users = connection.collection('users');
    if (await users.findOne({ username })) throw new Error(`Akun ${username} sudah ada; tidak diubah`);
    const now = new Date();
    await users.insertOne({ username, role, passwordHash: await bcrypt.hash(password, 10), active: true, createdAt: now, updatedAt: now });
    await connection.collection('auditlogs').insertOne({ at: now, actor: 'cli', action: 'USER_CREATE', target: username, summary: `Membuat akun ${username} (${role}) lewat CLI`, detail: { role } });
    console.log(`Akun ${username} (${role}) dibuat.`);
  } finally {
    await connection.close();
  }
}

main().catch((e) => {
  console.error(`Gagal: ${e.message}`);
  process.exitCode = 1;
});
