import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createServer } from 'node:http';
import * as ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connect, connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { migrate } from '../src/migrate';

const TEXT = 'Landasan pacu 06/24 ditutup karena pekerjaan mulai 2 November 2024 jam 0000 sampai 0500';
let mongo: MongoMemoryServer;
let app: INestApplication;
let http: any;
const tokens: Record<string, string> = {};

const api = (method: 'get' | 'post' | 'put' | 'patch' | 'delete', url: string, user?: string) => {
  const r = (request(http) as any)[method](url);
  return user ? r.set('Authorization', `Bearer ${tokens[user]}`) : r;
};

async function newSubmitted(route: 'ATS' | 'PIA', text = TEXT) {
  const { body } = await api('post', '/requests', 'orig').send({ airport: 'WIHH', freeText: text }).expect(201);
  await api('post', `/requests/${body._id}/submit`, 'orig').send({ route }).expect(201);
  return body._id as string;
}
const decide = (id: string, user: string, action: string, note?: string) =>
  api('post', `/requests/${id}/decision`, user).send({ action, note });

before(async () => {
  mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri('notam');
  await connect(uri);
  const hash = await bcrypt.hash('pw', 4);
  await connection.collection('users').insertMany(
    ['orig:ORIGINATOR', 'ats:ATS', 'pia:PIA', 'nof:NOF', 'orig2:ORIGINATOR', 'adm:ADMIN'].map((s) => {
      const [username, role] = s.split(':');
      return { username, role, passwordHash: hash };
    }),
  );
  await connection.close();
  app = await NestFactory.create(AppModule.register({ mongoUri: uri, jwtSecret: 'test' }), { logger: false });
  await app.init();
  http = app.getHttpServer();
  for (const u of ['orig', 'ats', 'pia', 'nof', 'orig2', 'adm']) {
    tokens[u] = (await api('post', '/auth/login').send({ username: u, password: 'pw' }).expect(201)).body.token;
  }
});

after(async () => {
  await app?.close();
  await mongo?.stop();
});

describe('auth & RBAC', () => {
  it('menolak tanpa token dan password salah', async () => {
    await api('get', '/requests').expect(401);
    await api('post', '/auth/login').send({ username: 'orig', password: 'x' }).expect(401);
  });

  it('hanya Originator yang dapat generate', async () => {
    await api('post', '/requests', 'ats').send({ airport: 'WIHH', freeText: TEXT }).expect(403);
    await api('post', '/requests', 'nof').send({ airport: 'WIHH', freeText: TEXT }).expect(403);
  });
});

describe('input Originator', () => {
  it('menolak tanggal relatif dan locator tidak valid', async () => {
    await api('post', '/requests', 'orig').send({ airport: 'WIHH', freeText: 'Runway ditutup hari ini' }).expect(400);
    await api('post', '/requests', 'orig').send({ airport: 'halim', freeText: TEXT }).expect(400);
    await api('post', '/requests', 'orig').send({ airport: 'ZZZZ', freeText: TEXT }).expect(400);
    await api('post', '/requests', 'orig').send({ airport: 'WIHH', freeText: TEXT + ' dan WADD' }).expect(400);
  });

  it('tanpa locator, bandara dikenali dari nama di narasi', async () => {
    const { body } = await api('post', '/requests', 'orig').send({ freeText: 'Apron di Bandar Udara Juanda ditutup karena pekerjaan mulai tanggal 6 November 2026 pukul 08.00 WIB sampai tanggal 6 November 2026 pukul 17.00 WIB' }).expect(201);
    assert.equal(body.airport, 'WARR');
    const none = await api('post', '/requests', 'orig').send({ freeText: TEXT }).expect(400);
    assert.ok(none.body.message.includes('tidak dikenali'));
    const two = await api('post', '/requests', 'orig').send({ freeText: 'Apron di Bandar Udara Juanda dan Bandar Udara Halim Perdanakusuma ditutup mulai tanggal 6 November 2026 pukul 08.00 WIB sampai tanggal 6 November 2026 pukul 17.00 WIB' }).expect(400);
    assert.ok(two.body.message.includes('lebih dari satu'));
    const det = await api('get', '/suggest/airport?text=PAPI%20di%20Bandara%20Halim%20Perdanakusuma', 'orig').expect(200);
    assert.equal(det.body.airports[0].locId, 'WIHH');
    const soetta = await api('get', '/suggest/airport?text=Apron%20di%20Soetta%20ditutup', 'orig').expect(200);
    assert.deepEqual(soetta.body.airports.map((a: { locId: string }) => a.locId), ['WIII']);
  });

  it('menolak nama bandara yang beda dengan locator, dan tanggal selesai sebelum mulai', async () => {
    const juanda = await api('post', '/requests', 'orig').send({ airport: 'WADD', freeText: 'Apron di Bandar Udara Juanda ditutup karena pekerjaan mulai tanggal 4 November 2026 pukul 08.00 WIB sampai tanggal 4 November 2026 pukul 17.00 WIB' }).expect(400);
    assert.ok(juanda.body.message.includes('JUANDA (WARR)'));
    const halim = await api('post', '/requests', 'orig').send({ airport: 'WIII', freeText: 'Landasan pacu 06/24 di Bandar Udara Halim Perdanakusuma ditutup karena pekerjaan mulai tanggal 9 November 2026 pukul 08.00 WIB sampai tanggal 15 November 2026 pukul 12.00 WIB' }).expect(400);
    assert.ok(halim.body.message.includes('WIHH'));
    const mundur = await api('post', '/requests', 'orig').send({ airport: 'WIHH', freeText: 'Landasan pacu 06/24 ditutup karena pekerjaan mulai tanggal 9 November 2026 pukul 08.00 WIB sampai tanggal 5 November 2026 pukul 12.00 WIB' }).expect(400);
    assert.ok(mundur.body.message.includes('selesai lebih awal'));
    await api('post', '/requests', 'orig').send({ airport: 'WIHH', freeText: 'Landasan pacu 06/24 di Bandar Udara Halim Perdanakusuma ditutup karena pekerjaan mulai tanggal 5 November 2026 pukul 08.00 WIB sampai tanggal 9 November 2026 pukul 12.00 WIB' }).expect(201);
  });

  it('hasil revisi dikirim balik ke peran yang meminta revisi', async () => {
    const a = await newSubmitted('ATS', `${TEXT} revisi ats`);
    await decide(a, 'ats', 'REVISE', 'perbaiki').expect(201);
    const ra = await api('post', `/requests/${a}/submit`, 'orig').send({ route: 'PIA' }).expect(201);
    assert.equal(ra.body.status, 'UNDER_ATS');
    const p = await newSubmitted('ATS', `${TEXT} revisi pia`);
    await decide(p, 'ats', 'ACCEPT').expect(201);
    await decide(p, 'pia', 'REVISE', 'perbaiki').expect(201);
    const rp = await api('post', `/requests/${p}/submit`, 'orig').send({ route: 'ATS' }).expect(201);
    assert.equal(rp.body.status, 'UNDER_PIA');
  });

  it('draf dengan validasi gagal tidak dapat di-submit', async () => {
    const { body } = await api('post', '/requests', 'orig').send({ airport: 'WIHH', freeText: TEXT }).expect(201);
    await app.get(getConnectionToken()).collection('notamrequests').updateOne({ formNo: body.formNo }, { $set: { 'versions.0.validation': { status: 'failed', issues: [{ code: 'A_MISMATCH', level: 'error', message: 'A) (WARR) tidak sama dengan locator pengajuan (WIHH)' }] } } });
    const res = await api('post', `/requests/${body._id}/submit`, 'orig').send({ route: 'ATS' }).expect(400);
    assert.ok(res.body.message.includes('belum dapat di-submit'));
  });

  it('revisi teks membuat versi baru dan menolak teks yang sama', async () => {
    const { body } = await api('post', '/requests', 'orig').send({ airport: 'WIHH', freeText: TEXT }).expect(201);
    assert.equal(body.versions.length, 1);
    await api('put', `/requests/${body._id}/text`, 'orig').send({ freeText: `  ${TEXT.toUpperCase()} ` }).expect(400);
    const r = await api('put', `/requests/${body._id}/text`, 'orig').send({ freeText: TEXT + ' (diubah)' }).expect(200);
    assert.deepEqual(r.body.versions.map((v: any) => v.no), [1, 2]);
  });
});

describe('alur review', () => {
  it('jalur ATS → PIA → NOF sampai approved, lengkap dengan riwayat', async () => {
    const id = await newSubmitted('ATS');
    await decide(id, 'pia', 'ACCEPT').expect(409);
    await decide(id, 'ats', 'ACCEPT').expect(201);
    await decide(id, 'pia', 'ACCEPT').expect(201);
    const r = await decide(id, 'nof', 'ACCEPT').expect(201);
    assert.equal(r.body.status, 'APPROVED_BY_NOF');
    assert.deepEqual(r.body.events.map((e: any) => e.to), ['UNDER_ATS', 'UNDER_PIA', 'UNDER_NOF', 'APPROVED_BY_NOF']);
    await decide(id, 'nof', 'ACCEPT').expect(409);
  });

  it('jalur langsung ke PIA dan catatan wajib untuk revisi', async () => {
    const id = await newSubmitted('PIA');
    await decide(id, 'ats', 'ACCEPT').expect(409);
    await decide(id, 'pia', 'REVISE').expect(409);
    const r = await decide(id, 'pia', 'REVISE', 'jam salah').expect(201);
    assert.equal(r.body.status, 'REVISION_REQUIRED');
  });

  it('PIA menyunting Q) dan E): versi baru, status tetap, hanya PIA saat Di PIA', async () => {
    const id = await newSubmitted('PIA');
    // Keluaran mock tidak berbentuk NOTAM; ganti dengan draf yang berformat benar agar suntingan realistis.
    const formNo = (await api('get', `/requests/${id}`, 'pia').expect(200)).body.formNo;
    const GEN = 'Q) WIIF/QMRLC/IV/NBO/A/000/999/0616S10653E005\nA) WIHH\nB) 2411020000\nC) 2411020500\nE) RWY 06/24 CLSD DUE TO WIP';
    await app.get(getConnectionToken()).collection('notamrequests').updateOne({ formNo }, { $set: { 'versions.0.generated': GEN } });
    const Q2 = 'WIIF/QMRHW/IV/NBO/A/000/999/0616S10653E005';
    const edit = (who: string, body: object) => api('put', `/requests/${id}/items`, who).send(body);
    await edit('orig', { Q: Q2 }).expect(403);
    await edit('ats', { Q: Q2 }).expect(403);
    await edit('pia', {}).expect(400);
    await edit('pia', { Q: 'ngawur' }).expect(400);
    await edit('pia', { E: '   ' }).expect(400);
    const r = await edit('pia', { Q: `q) ${Q2.toLowerCase()}`, E: 'rwy 06/24 wip' }).expect(200);
    assert.equal(r.body.status, 'UNDER_PIA');
    assert.equal(r.body.piaRevisionCount, 0);
    assert.equal(r.body.versions.length, 2);
    const v = r.body.versions[1];
    assert.ok(v.editedBy);
    assert.deepEqual(v.editedItems, ['Q', 'E']);
    assert.ok(v.generated.includes(`Q) ${Q2}`));
    assert.ok(v.generated.includes('E) RWY 06/24 WIP'));
    assert.ok(v.generated.includes('A) WIHH') && v.generated.includes('B) 2411020000')); // item lain tidak berubah
    assert.equal(v.freeText, r.body.versions[0].freeText);
    await edit('pia', { Q: Q2 }).expect(400); // tidak ada perubahan
    await decide(id, 'pia', 'ACCEPT').expect(201);
    await edit('pia', { E: 'RWY 06/24 CLSD' }).expect(409); // sudah di NOF
  });

  it('revisi PIA dibatasi 3x lalu hanya bisa reject', async () => {
    const id = await newSubmitted('PIA');
    for (let i = 1; i <= 3; i++) {
      await decide(id, 'pia', 'REVISE', `catatan ${i}`).expect(201);
      await api('put', `/requests/${id}/text`, 'orig').send({ freeText: `${TEXT} v${i + 1}` }).expect(200);
      await api('post', `/requests/${id}/submit`, 'orig').send({ route: 'PIA' }).expect(201);
    }
    await decide(id, 'pia', 'REVISE', 'keempat').expect(409);
    const r = await decide(id, 'pia', 'REJECT', 'ditolak').expect(201);
    assert.equal(r.body.status, 'REJECTED');
  });

  it('NOF reject mengembalikan ke PIA', async () => {
    const id = await newSubmitted('PIA');
    await decide(id, 'pia', 'ACCEPT').expect(201);
    const r = await decide(id, 'nof', 'REJECT', 'tidak sesuai').expect(201);
    assert.equal(r.body.status, 'UNDER_PIA');
  });

  it('Originator lain tidak dapat submit/ubah/melihat record orang lain', async () => {
    const { body } = await api('post', '/requests', 'orig').send({ airport: 'WIHH', freeText: TEXT }).expect(201);
    await api('post', `/requests/${body._id}/submit`, 'orig2').send({ route: 'PIA' }).expect(403);
    await api('put', `/requests/${body._id}/text`, 'orig2').send({ freeText: 'x 1 Januari 2025' }).expect(403);
    await api('get', `/requests/${body._id}`, 'orig2').expect(404);
  });
});

describe('ekspor', () => {
  it('PDF untuk pemilik/reviewer, Excel hanya reviewer', async () => {
    const id = await newSubmitted('PIA');
    const pdf = await api('get', `/requests/${id}/pdf`, 'orig').buffer(true).parse((res: any, cb: any) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); }).expect(200);
    assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');
    await api('get', `/requests/${id}/pdf`, 'orig2').expect(404);
    await api('get', '/requests/export.xlsx', 'orig').expect(403);
    const xl = await api('get', '/requests/export.xlsx?airport=WIHH', 'pia').buffer(true).parse((res: any, cb: any) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); }).expect(200);
    assert.equal(xl.body.subarray(0, 2).toString(), 'PK'); // xlsx = zip
  });
});

describe('list, filter, search', () => {
  it('reviewer tidak melihat DRAFT; filter status/bandara/pencarian bekerja', async () => {
    const draft = (await api('post', '/requests', 'orig').send({ airport: 'WADD', freeText: 'Taxiway ditutup 3 Maret 2025 unik-xyz' })).body;
    const reviewerList = (await api('get', '/requests', 'ats').expect(200)).body;
    assert.equal(reviewerList.find((r: any) => r._id === draft._id), undefined);
    await api('get', `/requests/${draft._id}`, 'ats').expect(404);

    const own = (await api('get', '/requests?airport=WADD&q=unik-xyz', 'orig').expect(200)).body;
    assert.deepEqual(own.map((r: any) => r._id), [draft._id]);
    const none = (await api('get', '/requests?status=APPROVED_BY_NOF&airport=WADD', 'orig').expect(200)).body;
    assert.equal(none.length, 0);
    await api('get', '/requests?q=(', 'orig').expect(200); // regex tidak meledak
  });
});

describe('admin: manajemen pengguna', () => {
  const user = (n: string) => ({ username: n, password: 'password-ok', role: 'ORIGINATOR' });
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  it('hanya ADMIN yang dapat mengelola pengguna; hash password tidak bocor', async () => {
    for (const u of ['orig', 'ats', 'pia', 'nof']) await api('get', '/users', u).expect(403);
    const { body } = await api('get', '/users', 'adm').expect(200);
    assert.ok(body.length >= 6);
    assert.ok(body.every((u: any) => !('passwordHash' in u) && u.active === true));
  });

  it('membuat akun dengan validasi dan menolak username ganda', async () => {
    await api('post', '/users', 'adm').send(user('Bad Name')).expect(400);
    await api('post', '/users', 'adm').send({ ...user('baru1'), password: 'pendek' }).expect(400);
    await api('post', '/users', 'adm').send({ ...user('baru1'), role: 'ROOT' }).expect(400);
    await api('post', '/users', 'adm').send(user('baru1')).expect(201);
    await api('post', '/users', 'adm').send(user('baru1')).expect(409);
    await api('post', '/auth/login').send({ username: 'baru1', password: 'password-ok' }).expect(201);
  });

  it('username boleh berupa alamat email; format tidak valid ditolak', async () => {
    for (const bad of ['@contoh.id', 'a@b', 'x@y.z', 'a b@contoh.id', 'a@@contoh.id']) await api('post', '/users', 'adm').send(user(bad)).expect(400);
    await api('post', '/users', 'adm').send({ ...user('admin.email@contoh.id'), role: 'ADMIN' }).expect(201);
    const tok = (await api('post', '/auth/login').send({ username: 'admin.email@contoh.id', password: 'password-ok' }).expect(201)).body.token;
    await request(http).get('/users').set({ Authorization: `Bearer ${tok}` }).expect(200); // role ADMIN berlaku
  });

  it('username dirapikan: spasi di ujung dan huruf kapital diubah ke huruf kecil, termasuk saat login', async () => {
    const made = await api('post', '/users', 'adm').send(user('  Rapi.Email@Contoh.ID ')).expect(201);
    assert.equal(made.body.username, 'rapi.email@contoh.id');
    await api('post', '/auth/login').send({ username: ' Rapi.Email@Contoh.ID', password: 'password-ok' }).expect(201);
    await api('post', '/users', 'adm').send(user('rapi.email@contoh.id')).expect(409); // sama setelah dirapikan
  });

  it('menonaktifkan akun berlaku seketika, termasuk token yang sudah terbit', async () => {
    await api('post', '/users', 'adm').send(user('sementara')).expect(201);
    const tok = (await api('post', '/auth/login').send({ username: 'sementara', password: 'password-ok' }).expect(201)).body.token;
    await request(http).get('/requests').set(bearer(tok)).expect(200);
    const id = (await api('get', '/users', 'adm')).body.find((u: any) => u.username === 'sementara')._id;
    await api('patch', `/users/${id}`, 'adm').send({ active: false }).expect(200);
    await request(http).get('/requests').set(bearer(tok)).expect(401);
    await api('post', '/auth/login').send({ username: 'sementara', password: 'password-ok' }).expect(401);
    await api('patch', `/users/${id}`, 'adm').send({ active: true, password: 'password-baru' }).expect(200);
    await api('post', '/auth/login').send({ username: 'sementara', password: 'password-baru' }).expect(201);
  });

  it('perubahan role berlaku seketika dan admin tidak dapat mengunci dirinya sendiri', async () => {
    const list = (await api('get', '/users', 'adm')).body;
    const sem = list.find((u: any) => u.username === 'sementara')._id;
    const tok = (await api('post', '/auth/login').send({ username: 'sementara', password: 'password-baru' })).body.token;
    await request(http).post('/requests').set(bearer(tok)).send({ airport: 'WIHH', freeText: TEXT }).expect(201);
    await api('patch', `/users/${sem}`, 'adm').send({ role: 'ATS' }).expect(200);
    await request(http).post('/requests').set(bearer(tok)).send({ airport: 'WIHH', freeText: TEXT }).expect(403);
    const me = list.find((u: any) => u.username === 'adm')._id;
    await api('patch', `/users/${me}`, 'adm').send({ active: false }).expect(400);
    await api('patch', `/users/${me}`, 'adm').send({ role: 'NOF' }).expect(400);
    await api('patch', `/users/${me}`, 'adm').send({}).expect(400);
    await api('patch', '/users/bukan-id', 'adm').send({ active: true }).expect(404);
  });

  it('hapus akun: hanya yang nonaktif dan bukan diri sendiri; terakhir login tercatat', async () => {
    await api('post', '/users', 'adm').send(user('hapus.saya')).expect(201);
    const find = async () => (await api('get', '/users', 'adm')).body.find((u: any) => u.username === 'hapus.saya');
    assert.equal((await find()).lastLoginAt, null);
    await api('post', '/auth/login').send({ username: 'hapus.saya', password: 'password-ok' }).expect(201);
    const row = await find();
    assert.ok(row.lastLoginAt && !Number.isNaN(Date.parse(row.lastLoginAt)));
    await api('delete', `/users/${row._id}`, 'ats').expect(403);
    await api('delete', `/users/${row._id}`, 'adm').expect(409); // masih aktif
    await api('patch', `/users/${row._id}`, 'adm').send({ active: false }).expect(200);
    const me = (await api('get', '/users', 'adm')).body.find((u: any) => u.username === 'adm')._id;
    await api('delete', `/users/${me}`, 'adm').expect(400);
    await api('delete', `/users/${row._id}`, 'adm').expect(200);
    assert.equal(await find(), undefined);
    await api('post', '/auth/login').send({ username: 'hapus.saya', password: 'password-ok' }).expect(401);
    await api('delete', `/users/${row._id}`, 'adm').expect(404);
    await api('delete', '/users/bukan-id', 'adm').expect(404);
  });

  it('admin hanya memantau: tidak dapat generate, memutuskan, atau melihat Draft', async () => {
    await api('post', '/requests', 'adm').send({ airport: 'WIHH', freeText: TEXT }).expect(403);
    const draft = (await api('post', '/requests', 'orig').send({ airport: 'WIHH', freeText: TEXT + ' draf admin' })).body._id;
    await api('get', `/requests/${draft}`, 'adm').expect(404);
    const id = await newSubmitted('ATS', TEXT + ' untuk admin');
    await api('get', `/requests/${id}`, 'adm').expect(200);
    await decide(id, 'adm', 'ACCEPT').expect(403);
    await api('get', '/requests/export.xlsx', 'adm').expect(200);
  });
});

describe('ketahanan operasional', () => {
  it('health check mengembalikan status database', async () => {
    const { body } = await api('get', '/health').expect(200);
    assert.equal(body.status, 'ok');
  });

  it('login dibatasi setelah 5 kegagalan, walau password benar', async () => {
    await api('post', '/users', 'adm').send({ username: 'kunci', password: 'password-ok', role: 'ORIGINATOR' }).expect(201);
    for (let i = 0; i < 5; i++) await api('post', '/auth/login').send({ username: 'kunci', password: 'salah' }).expect(401);
    await api('post', '/auth/login').send({ username: 'kunci', password: 'password-ok' }).expect(429);
    await api('post', '/auth/login').send({ username: 'baru1', password: 'password-ok' }).expect(201); // akun lain tidak terpengaruh
  });

  it('menolak teks freeform terlalu panjang', async () => {
    await api('post', '/requests', 'orig').send({ airport: 'WIHH', freeText: TEXT + ' x'.repeat(3000) }).expect(400);
  });
});

describe('dashboard dan reuse', () => {
  it('statistik dan aktivitas terbaru mengikuti cakupan role', async () => {
    assert.equal((await api('get', '/requests/stats', 'orig2')).body.total, 0);
    await api('post', '/requests', 'orig2').send({ airport: 'WADD', freeText: 'Taxiway ditutup 3 Maret 2025 dashboard' }).expect(201);
    const o = (await api('get', '/requests/stats', 'orig2')).body;
    assert.deepEqual(o.byStatus, { DRAFT: 1 });
    assert.deepEqual(o.recent, []); // draft belum punya aktivitas
    const adm = (await api('get', '/requests/stats', 'adm')).body;
    assert.equal(adm.byStatus.DRAFT, undefined);
    assert.equal(adm.total, Object.values(adm.byStatus as Record<string, number>).reduce((a, b) => a + b, 0));
    assert.ok(adm.recent.length > 0 && adm.recent.length <= 15);
    assert.ok(adm.byAirport.length > 0 && adm.byMonth.length > 0);
    const ats = (await api('get', '/requests/stats', 'ats')).body.recent as { formNo: string }[];
    assert.ok(ats.length > 0 && ats.length <= 15);
    const mine = (await api('get', '/requests/stats', 'orig')).body.recent as { formNo: string }[];
    assert.ok(mine.every((e) => !o.recent.some((x: { formNo: string }) => x.formNo === e.formNo)));
  });

  it('reuse: teks harus diubah dan hanya dari permintaan milik sendiri', async () => {
    const { body } = await api('post', '/requests', 'orig').send({ airport: 'WIHH', freeText: TEXT + ' sumber reuse' }).expect(201);
    const send = (user: string, freeText: string) => api('post', '/requests', user).send({ airport: 'WIHH', freeText, reuseOf: body._id });
    await send('orig', `  ${(TEXT + ' SUMBER REUSE').toUpperCase()} `).expect(400);
    await send('orig2', TEXT + ' sumber reuse diubah').expect(403);
    const r = await send('orig', TEXT + ' sumber reuse diubah').expect(201);
    assert.notEqual(r.body._id, body._id);
  });

  it('filter tanggal pengajuan', async () => {
    const q = (qs: string) => api('get', `/requests?${qs}`, 'orig');
    assert.ok((await q('from=2000-01-01T00:00:00.000Z')).body.length > 0);
    assert.equal((await q('to=2000-01-01T00:00:00.000Z')).body.length, 0);
  });
});

describe('kontrol server (ops)', () => {
  const setGate = (b: object) => api('put', '/ops/gate', 'adm').send(b);
  const resetGate = () => setGate({ enabled: true, message: '', dailyLimit: 0, window: '' }).expect(200);

  it('status hanya untuk ADMIN dan memuat info server, LLM, pemakaian', async () => {
    for (const u of ['orig', 'ats', 'pia', 'nof']) {
      await api('get', '/ops/status', u).expect(403);
      await api('put', '/ops/gate', u).send({ enabled: false }).expect(403);
      await api('post', '/ops/llm/unload', u).expect(403);
    }
    const { body } = await api('get', '/ops/status', 'adm').expect(200);
    assert.equal(body.server.db, true);
    assert.equal(body.llm.provider, 'mock');
    assert.equal(body.gateStatus.open, true);
    assert.ok(Array.isArray(body.usage.today) && body.usage.maxConcurrent >= 1);
    assert.ok(body.usage.today.some((t: any) => t.user === 'orig' && t.n > 0));
    await api('post', '/ops/llm/warmup', 'adm').expect(400); // hanya untuk ollama
  });

  it('jeda: generate dan generate ulang ditolak 503 dengan pesan admin; review tetap jalan; berlaku untuk semua dan dapat dibuka lagi', async () => {
    const id = await newSubmitted('ATS', TEXT + ' jeda');
    const draft = (await api('post', '/requests', 'orig').send({ airport: 'WIHH', freeText: TEXT + ' jeda draf' }).expect(201)).body._id;
    await setGate({ enabled: false, message: 'GPU sedang maintenance' }).expect(200);
    try {
      const g = (await api('get', '/ops/gate', 'orig').expect(200)).body;
      assert.deepEqual([g.open, g.reason], [false, 'GPU sedang maintenance']);
      const r = await api('post', '/requests', 'orig').send({ airport: 'WIHH', freeText: TEXT + ' ditolak jeda' }).expect(503);
      assert.match(r.body.message, /maintenance/);
      await api('put', `/requests/${draft}/text`, 'orig').send({ freeText: TEXT + ' jeda draf diubah' }).expect(503);
      await decide(id, 'ats', 'ACCEPT').expect(201); // alur review tidak terpengaruh
    } finally {
      await resetGate();
    }
    await api('post', '/requests', 'orig').send({ airport: 'WIHH', freeText: TEXT + ' setelah dibuka' }).expect(201);
  });

  it('kuota harian per pengguna dan validasi pengaturan', async () => {
    await setGate({ window: 'salah' }).expect(400);
    await setGate({ dailyLimit: -3 }).expect(400);
    await setGate({ dailyLimit: 1 }).expect(200);
    try {
      const r = await api('post', '/requests', 'orig').send({ airport: 'WIHH', freeText: TEXT + ' kuota' }).expect(429);
      assert.match(r.body.message, /harian/);
      assert.equal((await api('get', '/ops/gate', 'orig')).body.dailyLimit, 1);
    } finally {
      await resetGate();
    }
  });

  it('jeda membongkar model Ollama (GPU siaga) dan buka memuatnya lagi; tanpa perubahan status tidak ada panggilan', async () => {
    const calls: any[] = [];
    const stub = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => { if (req.method === 'POST') calls.push(JSON.parse(raw)); res.setHeader('content-type', 'application/json'); res.end('{}'); });
    });
    await new Promise<void>((r) => stub.listen(0, r));
    const saved = { ...process.env };
    delete process.env.OLLAMA_KEEP_ALIVE;
    Object.assign(process.env, { LLM_PROVIDER: 'ollama', LLM_MODEL: 'm1', OLLAMA_URL: `http://127.0.0.1:${(stub.address() as any).port}` });
    const settle = () => new Promise((r) => setTimeout(r, 300));
    try {
      await setGate({ enabled: false }).expect(200);
      await settle();
      await setGate({ message: 'x' }).expect(200);
      await settle();
      assert.deepEqual(calls.map((c) => [c.model, c.keep_alive]), [['m1', 0]]);
      await setGate({ enabled: true }).expect(200);
      await settle();
      assert.deepEqual(calls.map((c) => c.keep_alive), [0, '10m']);
    } finally {
      for (const k of ['LLM_PROVIDER', 'LLM_MODEL', 'OLLAMA_URL']) saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]);
      stub.close();
      await resetGate();
    }
  });

  it('jam layanan di luar jendela ditolak', async () => {
    const now = new Date();
    const h = (n: number) => String((now.getHours() + n + 24) % 24).padStart(2, '0');
    await setGate({ window: `${h(2)}:00-${h(3)}:00` }).expect(200); // mulai 2 jam lagi: sekarang di luar
    try {
      await api('post', '/requests', 'orig').send({ airport: 'WIHH', freeText: TEXT + ' luar jam' }).expect(503);
    } finally {
      await resetGate();
    }
  });
});

describe('audit log', () => {
  const list = async (qs = '') => (await api('get', `/audit${qs}`, 'adm').expect(200)).body as { items: any[]; total: number };

  it('hanya ADMIN yang dapat membaca; tidak ada endpoint ubah/hapus', async () => {
    for (const u of ['orig', 'ats', 'pia', 'nof']) {
      await api('get', '/audit', u).expect(403);
      await api('get', '/audit/export.csv', u).expect(403);
    }
    await api('delete', '/audit', 'adm').expect(404);
    await api('put', '/audit', 'adm').expect(404);
  });

  it('mencatat login, pengguna, server, dan aksi NOTAM; password tidak pernah tersimpan', async () => {
    await api('post', '/auth/login').send({ username: 'tak-ada', password: 'password-rahasia-xyz' }).expect(401);
    await api('post', '/users', 'adm').send({ username: 'diaudit', password: 'password-rahasia-xyz', role: 'ORIGINATOR' }).expect(201);
    const id = (await api('get', '/users', 'adm')).body.find((u: any) => u.username === 'diaudit')._id;
    await api('patch', `/users/${id}`, 'adm').send({ role: 'ATS', password: 'password-rahasia-baru' }).expect(200);
    await api('patch', `/users/${id}`, 'adm').send({ active: false }).expect(200);
    await api('patch', `/users/${id}`, 'adm').send({ active: false }).expect(200); // tanpa perubahan: tidak dicatat
    await api('delete', `/users/${id}`, 'adm').expect(200);
    await api('put', '/ops/gate', 'adm').send({ dailyLimit: 7 }).expect(200);
    await api('put', '/ops/gate', 'adm').send({ dailyLimit: 7 }).expect(200); // tanpa perubahan: tidak dicatat
    await api('put', '/ops/gate', 'adm').send({ dailyLimit: 0 }).expect(200);
    const formId = await newSubmitted('ATS', TEXT + ' audit');
    await decide(formId, 'ats', 'REVISE', 'perbaiki jam').expect(201);

    const all = (await list('?limit=100')).items;
    const by = (action: string) => all.filter((e) => e.action === action);
    assert.ok(by('LOGIN_OK').length > 0 && by('LOGIN_FAIL').some((e) => e.actor === 'tak-ada'));
    assert.equal(by('USER_CREATE').filter((e) => e.target === 'diaudit').length, 1);
    const upd = by('USER_UPDATE').filter((e) => e.target === 'diaudit');
    assert.equal(upd.length, 2);
    assert.ok(upd.some((e) => /role ORIGINATOR → ATS/.test(e.summary) && /password direset/.test(e.summary)));
    assert.ok(upd.some((e) => /dinonaktifkan/.test(e.summary)));
    assert.equal(by('USER_DELETE').filter((e) => e.target === 'diaudit').length, 1);
    assert.equal(by('SERVER_GATE').length >= 2 && by('SERVER_GATE').filter((e) => /dailyLimit 0 → 7/.test(e.summary)).length, 1);
    assert.ok(by('REQUEST_CREATE').length > 0 && by('REQUEST_SUBMIT').length > 0);
    assert.ok(by('REQUEST_REVISE').some((e) => /perbaiki jam/.test(e.summary) && e.actor === 'ats' && e.role === 'ATS'));
    const raw = JSON.stringify(all);
    assert.ok(!raw.includes('password-rahasia') && !raw.includes('passwordHash'));
    assert.ok(all.every((e, i) => i === 0 || new Date(all[i - 1].at) >= new Date(e.at))); // terbaru dahulu
  });

  it('filter kategori, pelaku, pencarian, tanggal; halaman konsisten', async () => {
    const users = await list('?category=USER&limit=100');
    assert.ok(users.items.length > 0 && users.items.every((e) => e.action.startsWith('USER_')));
    const ats = await list('?actor=ats&limit=100');
    assert.ok(ats.items.length > 0 && ats.items.every((e) => e.actor === 'ats'));
    const q = await list('?q=perbaiki%20jam');
    assert.ok(q.items.length >= 1 && q.items.every((e) => /perbaiki jam/.test(e.summary)));
    assert.equal((await list('?to=2000-01-01T00:00:00.000Z')).total, 0);
    assert.ok((await list('?from=2000-01-01T00:00:00.000Z')).total > 0);
    await api('get', '/audit?category=XYZ', 'adm').expect(400);
    await api('get', '/audit?from=bukan-tanggal', 'adm').expect(400);
    await api('get', '/audit?q=(', 'adm').expect(200); // regex tidak meledak

    const total = (await list()).total;
    const p1 = await list('?limit=5&skip=0');
    const p2 = await list('?limit=5&skip=5');
    assert.equal(p1.total, total);
    assert.equal(p1.items.length, 5);
    assert.ok(p1.items.every((a) => p2.items.every((b) => String(a._id) !== String(b._id))));
    assert.ok((await list('?limit=9999')).items.length <= 100);
  });

  it('ekspor CSV: BOM, header, dan sel berawalan rumus diberi apostrof', async () => {
    await api('post', '/auth/login').send({ username: '=1+1', password: 'x' }).expect(401);
    const res = await api('get', '/audit/export.csv?category=LOGIN', 'adm').expect(200);
    assert.match(res.headers['content-type'], /text\/csv/);
    const text = String(res.text);
    assert.ok(text.startsWith('﻿"Waktu (UTC)","Pelaku","Role","Aksi","Target","Keterangan","IP"'));
    assert.ok(text.includes(`"'=1+1"`));
    assert.ok(!text.includes('"=1+1"'));
  });
});

describe('analytics eksekutif', () => {
  const binary = (r: any) => r.buffer(true).parse((res: any, cb: any) => { const d: Buffer[] = []; res.on('data', (c: Buffer) => d.push(c)); res.on('end', () => cb(null, Buffer.concat(d))); });
  const get = async (qs = '', user = 'adm') => (await api('get', `/analytics${qs}`, user).expect(200)).body;

  it('hanya role non-Originator; Originator ditolak di semua endpoint', async () => {
    for (const p of ['', '/export.xlsx', '/export.pptx']) {
      await api('get', `/analytics${p}`, 'orig').expect(403);
      await api('get', `/analytics${p}`).expect(401);
      for (const u of ['ats', 'pia', 'nof', 'adm']) await api('get', `/analytics${p}`, u).expect(200);
    }
  });

  it('angka konsisten dengan daftar NOTAM (total dan per status)', async () => {
    const list = (await api('get', '/requests', 'adm').expect(200)).body as any[];
    const a = await get();
    assert.equal(a.kpi.total, list.length);
    const byStatus: Record<string, number> = {};
    for (const r of list) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    assert.deepEqual(a.status, byStatus);
    assert.equal(a.kpi.approved, byStatus.APPROVED_BY_NOF ?? 0);
    assert.equal(a.kpi.rejected, byStatus.REJECTED ?? 0);
    assert.equal(a.funnel[0].label, 'Diajukan (submit)');
    assert.ok(a.funnel[0].n >= a.funnel[3].n);
    assert.ok(a.insights.length > 0 && a.series.length > 0);
  });

  it('filter bandara dan periode; parameter tidak valid ditolak', async () => {
    const all = await get();
    const wihh = await get('?airport=WIHH');
    assert.ok(wihh.kpi.total > 0 && wihh.kpi.total <= all.kpi.total);
    assert.ok(wihh.airports.every((x: any) => x.airport === 'WIHH'));
    const none = await get('?to=2000-01-01T00:00:00.000Z');
    assert.equal(none.kpi.total, 0);
    assert.deepEqual(none.insights, ['Belum ada pengajuan pada periode ini.']);
    await api('get', '/analytics?airport=wihh', 'adm').expect(400);
    await api('get', '/analytics?from=bukan', 'adm').expect(400);
    await api('get', '/analytics?from=2030-01-01T00:00:00Z&to=2020-01-01T00:00:00Z', 'adm').expect(400);
    await api('get', '/analytics/export.xlsx?airport=XX', 'adm').expect(400);
  });

  it('Excel: sheet lengkap, angka sama dengan JSON, baris Data = jumlah pengajuan', async () => {
    const a = await get();
    const res = await binary(api('get', '/analytics/export.xlsx', 'nof')).expect(200);
    assert.match(res.headers['content-type'], /spreadsheetml/);
    assert.match(res.headers['content-disposition'], /notam-ringkasan-eksekutif-\d{8}\.xlsx/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    assert.deepEqual(wb.worksheets.map((w) => w.name), ['Ringkasan', 'Tren', 'Alur & Tahapan', 'Bandara & Jenis', 'Pengusul', 'Kualitas AI', 'Data']);
    const sum = wb.getWorksheet('Ringkasan')!;
    const find = (label: string) => { let v: unknown; sum.eachRow((r) => { if (r.getCell(1).value === label) v = r.getCell(2).value; }); return v; };
    assert.equal(find('Total pengajuan'), a.kpi.total);
    assert.equal(find('Disetujui NOF'), a.kpi.approved);
    assert.equal(find('Ditolak'), a.kpi.rejected);
    const data = wb.getWorksheet('Data')!;
    assert.equal(data.rowCount - 4, a.kpi.total);
    assert.equal(data.getCell('A4').value, 'Nomor Form');
    assert.deepEqual([11, 12].map((c) => data.getCell(4, c).value), ['Notam Prompt', 'Notam Generated']);
    assert.ok(data.rowCount < 5 || String(data.getCell(5, 12).value).length > 0);
    assert.match(String(data.getCell('A5').value), /^FRM-/);
    const trend = wb.getWorksheet('Tren')!;
    assert.equal(trend.getCell('A6').value, a.series[0].period);
  });

  it('PPT: 10 slide dengan grafik native, semua elemen berada di dalam slide, memuat angka KPI', async () => {
    const a = await get();
    const res = await binary(api('get', '/analytics/export.pptx', 'adm')).expect(200);
    assert.match(res.headers['content-type'], /presentationml/);
    assert.match(res.headers['content-disposition'], /\.pptx/);
    const zip = await JSZip.loadAsync(res.body);
    const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((x, y) => Number(x.match(/(\d+)/)![1]) - Number(y.match(/(\d+)/)![1]));
    assert.equal(slides.length, 10);
    assert.ok(Object.keys(zip.files).filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f)).length >= 6);
    const W = Math.round(13.333 * 914400), H = Math.round(7.5 * 914400), tol = 20000;
    for (const f of slides) {
      const xml = await zip.file(f)!.async('string');
      for (const m of xml.matchAll(/<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/g)) {
        const [x, y, cx, cy] = m.slice(1).map(Number);
        assert.ok(x >= -tol && y >= -tol && x + cx <= W + tol && y + cy <= H + tol, `${f}: elemen di luar slide (${x},${y},${cx},${cy})`);
      }
    }
    const s2 = await zip.file(slides[1])!.async('string');
    assert.ok(s2.includes(`>${a.kpi.total}<`) && s2.includes('Ringkasan Eksekutif'));
    const s3 = await zip.file(slides[2])!.async('string');
    assert.ok(s3.includes(a.insights[0].slice(0, 20)));
  });

  it('ekspor tercatat di audit log', async () => {
    const q = (await api('get', '/audit?q=ringkasan%20eksekutif&category=REQUEST&limit=20', 'adm').expect(200)).body;
    assert.ok(q.items.some((e: any) => e.action === 'REQUEST_EXPORT' && /Excel/.test(e.summary)));
    assert.ok(q.items.some((e: any) => e.action === 'REQUEST_EXPORT' && /PowerPoint/.test(e.summary)));
  });
});

describe('laporan jenis NOTAM', () => {
  const binary = (r: any) => r.buffer(true).parse((res: any, cb: any) => { const d: Buffer[] = []; res.on('data', (c: Buffer) => d.push(c)); res.on('end', () => cb(null, Buffer.concat(d))); });
  const gen = (q: string, e: string) => `Q) WAAF/${q}/IV/NBO/A/000/999/0116S11654E005\nA) WAAA\nB) 2611050100\nC) 2611060500\nE) ${e}`;
  const ver = (q: string, e: string) => [{ no: 1, freeText: 'x', generated: gen(q, e), provider: 'ollama', ms: 1000, validation: { status: 'passed', issues: [] }, createdAt: new Date() }];
  const get = async (qs: string, user = 'adm') => (await api('get', `/analytics/types${qs}`, user).expect(200)).body;

  before(async () => {
    const col = app.get(getConnectionToken()).collection('notamrequests');
    const now = new Date();
    const base = { airport: 'WAAA', originator: 'orig', events: [], createdAt: now, updatedAt: now };
    await col.insertMany([
      { ...base, formNo: 'FRM-TIPE-1', status: 'APPROVED_BY_NOF', versions: ver('QMRLC', 'RWY 06/24 CLSD DUE TO WIP') },
      { ...base, formNo: 'FRM-TIPE-2', status: 'UNDER_ATS', versions: ver('QMXLC', 'TWY A CLSD') },
      { ...base, formNo: 'FRM-TIPE-3', status: 'UNDER_PIA', versions: ver('QLPAS', 'PAPI RWY 24 U/S') },
    ]);
  });

  it('hanya role non-Originator', async () => {
    for (const p of ['', '/list', '/export.xlsx', '/export.pptx']) {
      await api('get', `/analytics/types${p}`, 'orig').expect(403);
      await api('get', `/analytics/types${p}`).expect(401);
      for (const u of ['ats', 'pia', 'nof', 'adm']) await api('get', `/analytics/types${p}`, u).expect(200);
    }
  });

  it('kelompok, subjek, dan kondisi dihitung dari kode Q', async () => {
    const r = await get('?airport=WAAA');
    assert.equal(r.total, 3);
    assert.equal(r.coded, 3);
    assert.deepEqual(r.groups.map((g: any) => [g.group, g.n]), [['M', 2], ['L', 1]]);
    assert.equal(r.groups[0].name, 'Area pergerakan dan pendaratan');
    assert.deepEqual(r.groups[0].subjects.map((s: any) => [s.code, s.label, s.n]), [['MR', 'Runway', 1], ['MX', 'Taxiway', 1]]);
    assert.equal(r.groups[0].approved, 1);
    assert.deepEqual(r.conditions.map((c: any) => [c.code, c.n]), [['LC', 2], ['AS', 1]]);
    assert.equal(r.matrix.rows[0].airport, 'WAAA');
    assert.ok(r.insights.length > 0);
  });

  it('filter status, periode, dan parameter tidak valid', async () => {
    const approved = await get('?airport=WAAA&status=APPROVED_BY_NOF');
    assert.equal(approved.total, 1);
    assert.equal(approved.groups[0].subjects[0].code, 'MR');
    assert.equal((await get('?airport=WAAA&to=2000-01-01T00:00:00.000Z')).total, 0);
    await api('get', '/analytics/types?status=DRAFT', 'adm').expect(400);
    await api('get', '/analytics/types?status=ngawur', 'adm').expect(400);
    await api('get', '/analytics/types?airport=waaa', 'adm').expect(400);
    await api('get', '/analytics/types?from=bukan', 'adm').expect(400);
  });

  it('semua jenis konsisten dengan total NOTAM non-Draft', async () => {
    const all = await get('');
    const list = (await api('get', '/requests', 'adm').expect(200)).body as any[];
    assert.equal(all.total, list.length);
    assert.equal(all.coded + all.uncoded, all.total);
    assert.equal(all.groups.reduce((a: number, g: any) => a + g.n, 0), all.coded);
    assert.equal(all.impact.reduce((a: number, i: any) => a + i.n, 0), all.coded); // dampak operasional konsisten
    assert.equal(all.impactMatrix.reduce((a: number, m: any) => a + m.total, 0) <= all.coded, true);
    assert.ok(all.airportDetail.every((a: any) => a.subjects.reduce((x: number, s: any) => x + s.n, 0) === a.total));
  });

  it('filter dampak pada daftar rincian', async () => {
    const base = '/analytics/types/list?airport=WAAA';
    const total = (await api('get', base, 'adm').expect(200)).body.total;
    let sum = 0;
    for (const k of ['CLOSED', 'LIMITED', 'NORMAL', 'OTHER']) sum += (await api('get', `${base}&impact=${k}`, 'adm').expect(200)).body.total;
    assert.equal(sum, total);
    await api('get', `${base}&impact=NGAWUR`, 'adm').expect(400);
  });

  it('daftar NOTAM per jenis (rincian)', async () => {
    const l = (await api('get', '/analytics/types/list?airport=WAAA&group=M&subject=MR&condition=LC', 'adm').expect(200)).body;
    assert.equal(l.total, 1);
    assert.equal(l.items[0].formNo, 'FRM-TIPE-1');
    assert.equal(l.items[0].qcode, 'QMRLC');
    assert.equal(l.items[0].text, 'RWY 06/24 CLSD DUE TO WIP');
    assert.ok(l.items[0].full.startsWith('Q) WAAF/QMRLC') && l.items[0].full.includes('E) RWY 06/24 CLSD DUE TO WIP'));
    assert.equal(l.items[0].prompt, 'x');
    assert.equal((await api('get', '/analytics/types/list?airport=WAAA&group=M', 'adm')).body.total, 2);
    assert.equal((await api('get', '/analytics/types/list?airport=WAAA&group=Z', 'adm')).body.total, 0);
  });

  it('Excel: sheet lengkap dan angka sama dengan laporan', async () => {
    const res = await binary(api('get', '/analytics/types/export.xlsx?airport=WAAA', 'nof')).expect(200);
    assert.match(res.headers['content-type'], /spreadsheetml/);
    assert.match(res.headers['content-disposition'], /notam-laporan-jenis-\d{8}\.xlsx/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    assert.deepEqual(wb.worksheets.map((w) => w.name), ['Ringkasan Jenis', 'Rincian', 'Tren Jenis', 'Bandara x Jenis', 'Data']);
    const sum = wb.getWorksheet('Ringkasan Jenis')!;
    assert.match(String(sum.getCell('A6').value), /Area pergerakan dan pendaratan \(M\)/);
    assert.equal(sum.getCell('B6').value, 2);
    const data = wb.getWorksheet('Data')!;
    assert.equal(data.rowCount - 4, 3);
    const codes = [5, 6, 7].map((r) => String(data.getCell(r, 6).value)).sort();
    assert.deepEqual(codes, ['QLPAS', 'QMRLC', 'QMXLC']);
    assert.deepEqual([11, 12].map((c) => data.getCell(4, c).value), ['Notam Prompt', 'Notam Generated']);
    assert.ok([5, 6, 7].every((r) => String(data.getCell(r, 12).value).startsWith('Q) WAAF/')));
  });

  it('PPT: 7 slide, semua elemen di dalam slide, memuat jumlah NOTAM', async () => {
    const res = await binary(api('get', '/analytics/types/export.pptx?airport=WAAA', 'adm')).expect(200);
    assert.match(res.headers['content-type'], /presentationml/);
    const zip = await JSZip.loadAsync(res.body);
    const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((x, y) => Number(x.match(/(\d+)/)![1]) - Number(y.match(/(\d+)/)![1]));
    assert.equal(slides.length, 7);
    const W = Math.round(13.333 * 914400), H = Math.round(7.5 * 914400), tol = 20000;
    for (const f of slides) {
      const xml = await zip.file(f)!.async('string');
      for (const m of xml.matchAll(/<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/g)) {
        const [x, y, cx, cy] = m.slice(1).map(Number);
        assert.ok(x >= -tol && y >= -tol && x + cx <= W + tol && y + cy <= H + tol, `${f}: elemen di luar slide`);
      }
    }
    assert.ok((await zip.file(slides[1])!.async('string')).includes('Total NOTAM'));
    assert.ok(Object.keys(zip.files).filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f)).length >= 4);
  });

  it('ekspor laporan jenis tercatat di audit log', async () => {
    const q = (await api('get', '/audit?q=laporan%20jenis&category=REQUEST&limit=20', 'adm').expect(200)).body;
    assert.ok(q.items.some((e: any) => e.action === 'REQUEST_EXPORT' && /Excel/.test(e.summary)));
    assert.ok(q.items.some((e: any) => e.action === 'REQUEST_EXPORT' && /PowerPoint/.test(e.summary)));
  });
});

describe('migrasi database', () => {
  const conn = () => app.get(getConnectionToken());
  const col = (db: string, name: string) => conn().useDb(db, { useCache: false }).collection(name);
  const SRC = 'mig_src';
  const uri = () => mongo.getUri(SRC);

  before(async () => {
    const now = new Date();
    await col(SRC, 'users').insertMany([
      { username: 'admin.a', role: 'ADMIN', passwordHash: 'x', active: true, createdAt: now },
      { username: 'orig.a', role: 'ORIGINATOR', passwordHash: 'y', active: true, createdAt: now },
    ]);
    await col(SRC, 'notamrequests').insertMany([1, 2, 3].map((i) => ({ formNo: `FRM-MIG-${i}`, airport: 'WIHH', originator: 'orig.a', status: 'UNDER_ATS', versions: [], events: [], createdAt: now })));
    await col(SRC, 'settings').insertOne({ key: 'gate', value: { enabled: true, dailyLimit: 5 } });
    await col(SRC, 'auditlogs').insertMany([1, 2, 3, 4, 5].map((i) => ({ at: now, actor: 'uji', action: 'LOGIN_OK', summary: `uji ${i}` })));
  });

  it('menyalin data nyata dengan _id yang sama, tanpa audit pengujian, dan tidak mengubah sumber', async () => {
    const r = await migrate({ uri: uri(), newDb: 'mig_dst' });
    assert.deepEqual(r.copied, { users: 2, notamrequests: 3, settings: 1 });
    assert.equal(r.from, SRC);
    const srcIds = (await col(SRC, 'users').find({}).toArray()).map((d) => String(d._id)).sort();
    const dstIds = (await col('mig_dst', 'users').find({}).toArray()).map((d) => String(d._id)).sort();
    assert.deepEqual(dstIds, srcIds);
    assert.equal(await col('mig_dst', 'notamrequests').countDocuments(), 3);
    assert.deepEqual((await col('mig_dst', 'settings').findOne({}))?.value, { enabled: true, dailyLimit: 5 });
    const audit = await col('mig_dst', 'auditlogs').find({}).toArray();
    assert.equal(audit.length, 1);
    assert.equal(audit[0].action, 'SERVER_MIGRATE');
    assert.match(String(audit[0].summary), /mig_src.*mig_dst.*users: 2.*notamrequests: 3/);
    // sumber tidak berubah
    assert.equal(await col(SRC, 'users').countDocuments(), 2);
    assert.equal(await col(SRC, 'auditlogs').countDocuments(), 5);
  });

  it('menolak tujuan yang sudah berisi data, nama sama, dan nama tidak valid', async () => {
    await assert.rejects(() => migrate({ uri: uri(), newDb: 'mig_dst' }), /sudah berisi data/);
    await assert.rejects(() => migrate({ uri: uri(), newDb: SRC }), /harus berbeda/);
    await assert.rejects(() => migrate({ uri: uri(), newDb: 'nama salah!' }), /NEW_DB/);
    assert.equal(await col('mig_dst', 'users').countDocuments(), 2); // tidak ada penambahan ganda
  });

  it('audit dapat disertakan bila diminta', async () => {
    const r = await migrate({ uri: uri(), newDb: 'mig_dst2', includeAudit: true });
    assert.equal(r.copied.auditlogs, 5);
    assert.equal(await col('mig_dst2', 'auditlogs').countDocuments(), 6); // 5 + catatan migrasi
  });

  it('akun hasil migrasi dapat login di aplikasi yang memakai database baru (hash password ikut pindah)', async () => {
    // verifikasi hash identik dengan sumber: login nyata dibuktikan pada pengujian langsung setelah pergantian MONGO_URI
    const s = await col(SRC, 'users').findOne({ username: 'admin.a' });
    const d = await col('mig_dst', 'users').findOne({ username: 'admin.a' });
    assert.equal(d?.passwordHash, s?.passwordHash);
    assert.equal(d?.role, 'ADMIN');
  });
});

describe('kamus (API)', () => {
  const binary = (r: any) => r.buffer(true).parse((res: any, cb: any) => { const d: Buffer[] = []; res.on('data', (c: Buffer) => d.push(c)); res.on('end', () => cb(null, Buffer.concat(d))); });

  it('dapat dibaca semua peran yang login, bukan anonim', async () => {
    await api('get', '/dictionary').expect(401);
    await api('get', '/dictionary/export.xlsx').expect(401);
    for (const u of ['orig', 'ats', 'pia', 'nof', 'adm']) {
      const { body } = await api('get', '/dictionary', u).expect(200);
      assert.equal(body.length, 9);
    }
  });

  it('isi kamus sesuai master dan dataset', async () => {
    const d = (await api('get', '/dictionary', 'orig').expect(200)).body as any[];
    const by = (id: string) => d.find((c) => c.id === 'bandara');
    assert.ok(by('bandara').tables[0].rows.length >= 500);
    assert.ok(by('bandara').tables[0].rows.some((r: any) => r.locId === 'WIHH' && r.zona === 'WIB'));
    const q = d.find((c) => c.id === 'qcode');
    assert.deepEqual(q.tables.map((t: any) => t.id), ['kelompok', 'subjek', 'kondisi', 'sebaran']);
    const sing = d.find((c) => c.id === 'singkatan');
    assert.ok(sing.tables.flatMap((t: any) => t.rows).some((r: any) => r.kode === 'RWY' && r.jumlah > 0));
  });

  it('Excel: satu sheet per kategori dengan tabel bertingkat', async () => {
    const res = await binary(api('get', '/dictionary/export.xlsx', 'orig')).expect(200);
    assert.match(res.headers['content-type'], /spreadsheetml/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    assert.deepEqual(wb.worksheets.map((w) => w.name), ['Bandara', 'FIR', 'Kode Q', 'Singkatan', 'Istilah', 'Item NOTAM', 'Waktu', 'Aplikasi', 'Pelabelan']);
    const b = wb.getWorksheet('Bandara')!;
    assert.match(String(b.getCell('A1').value), /Kamus: Kode bandara/);
    assert.ok(b.rowCount > 500);
    assert.equal(wb.getWorksheet('Kode Q')!.getCell('A1').value, 'Kamus: Kode Q');
  });
});

describe('profil saya', () => {
  const login = async (username: string, password: string) => (await api('post', '/auth/login').send({ username, password }).expect(201)).body.token as string;
  const as = (method: 'get' | 'post' | 'patch', url: string, token: string) => (request(http) as any)[method](url).set('Authorization', `Bearer ${token}`);

  it('ubah nama, ganti password, dan ganti email beserta kepemilikan NOTAM', async () => {
    await api('post', '/users', 'adm').send({ username: 'profil@contoh.id', name: 'Awal', password: 'rahasia-awal', role: 'ORIGINATOR' }).expect(201);
    let t = await login('profil@contoh.id', 'rahasia-awal');
    const me = (await as('get', '/me', t).expect(200)).body;
    assert.equal(me.name, 'Awal');
    assert.equal(me.passwordHash, undefined);
    assert.equal((await as('patch', '/me', t).send({ name: '  Rizky   Fadhillah ' }).expect(200)).body.name, 'Rizky Fadhillah');
    assert.equal((await as('patch', '/me', t).send({ name: 'x'.repeat(81) }).expect(400)).body.message, 'Nama maksimal 80 karakter');

    await as('post', '/me/password', t).send({ current: 'salah-sekali', next: 'rahasia-baru' }).expect(400);
    await as('post', '/me/password', t).send({ current: 'rahasia-awal', next: 'pendek' }).expect(400);
    await as('post', '/me/password', t).send({ current: 'rahasia-awal', next: 'rahasia-baru' }).expect(201);
    await api('post', '/auth/login').send({ username: 'profil@contoh.id', password: 'rahasia-awal' }).expect(401);
    t = await login('profil@contoh.id', 'rahasia-baru');

    const { body: doc } = await as('post', '/requests', t).send({ airport: 'WIHH', freeText: TEXT + ' profil' }).expect(201);
    await as('post', '/me/username', t).send({ username: 'orig', current: 'rahasia-baru' }).expect(409);
    await as('post', '/me/username', t).send({ username: 'baru@contoh.id', current: 'salah-sekali' }).expect(400);
    const changed = (await as('post', '/me/username', t).send({ username: 'Baru@Contoh.id', current: 'rahasia-baru' }).expect(201)).body;
    assert.equal(changed.username, 'baru@contoh.id');
    await as('get', `/requests/${doc._id}`, changed.token).expect(200);
    await api('post', '/auth/login').send({ username: 'profil@contoh.id', password: 'rahasia-baru' }).expect(401);
    await login('baru@contoh.id', 'rahasia-baru');
    const audit = (await api('get', '/audit?action=PROFILE_USERNAME', 'adm')).body;
    assert.ok(JSON.stringify(audit).includes('baru@contoh.id'));
  });

  it('admin dapat mengisi nama saat membuat dan mengubah akun', async () => {
    const u = (await api('post', '/users', 'adm').send({ username: 'bernama', name: 'Petugas PIA', password: 'rahasia-pia', role: 'PIA' }).expect(201)).body;
    assert.equal(u.name, 'Petugas PIA');
    assert.equal((await api('patch', `/users/${u._id}`, 'adm').send({ name: 'PIA Manado' }).expect(200)).body.name, 'PIA Manado');
  });
});

describe('wilayah (cabang)', () => {
  const mk = async (username: string, role: string, regions?: string[]) => {
    await api('post', '/users', 'adm').send({ username, password: 'password-ok', role, ...(regions && { regions }) }).expect(201);
    tokens[username] = (await api('post', '/auth/login').send({ username, password: 'password-ok' }).expect(201)).body.token;
  };

  it('admin mengelola wilayah; validasi locator dan bandara tidak boleh di dua wilayah', async () => {
    await api('post', '/regions', 'pia').send({ code: 'JKT', name: 'Jakarta', airports: ['WIHH'] }).expect(403);
    await api('post', '/regions', 'adm').send({ code: 'jkt', name: 'Jakarta', airports: ['WIHH'] }).expect(201);
    await api('post', '/regions', 'adm').send({ code: 'JKT', name: 'Lagi', airports: [] }).expect(409); // kode ganda
    await api('post', '/regions', 'adm').send({ code: 'X', name: 'Pendek', airports: [] }).expect(400);
    await api('post', '/regions', 'adm').send({ code: 'NGAWUR', name: 'Salah', airports: ['ZZZZ'] }).expect(400);
    await api('post', '/regions', 'adm').send({ code: 'DUP', name: 'Ganda', airports: ['WIHH'] }).expect(409); // WIHH sudah di JKT
    await api('post', '/regions', 'adm').send({ code: 'SUB', name: 'Surabaya', airports: 'WARR, WARR' }).expect(201);
    const list = (await api('get', '/regions', 'orig').expect(200)).body; // semua yang login boleh membaca
    assert.deepEqual(list.map((r: any) => [r.code, r.airports]), [['JKT', ['WIHH']], ['SUB', ['WARR']]]);
    await api('patch', '/regions/SUB', 'adm').send({ airports: ['WARR', 'WIHH'] }).expect(409);
    await api('patch', '/regions/SUB', 'adm').send({ name: 'Surabaya Raya' }).expect(200);
  });

  it('pengguna dengan wilayah hanya dapat membuat NOTAM untuk bandara wilayahnya', async () => {
    await api('post', '/users', 'adm').send({ username: 'o-salah', password: 'password-ok', role: 'ORIGINATOR', regions: ['TIDAKADA'] }).expect(400);
    await mk('o-jkt', 'ORIGINATOR', ['JKT']);
    const own = await api('post', '/requests', 'o-jkt').send({ airport: 'WIHH', freeText: TEXT }).expect(201);
    assert.equal(own.body.airport, 'WIHH');
    await api('post', '/requests', 'o-jkt').send({ airport: 'WARR', freeText: TEXT.replace('Landasan pacu', 'Taxiway') }).expect(403);
    await api('post', '/requests', 'orig').send({ airport: 'WARR', freeText: TEXT }).expect(201); // tanpa wilayah: tidak dibatasi
  });

  it('peninjau hanya dapat memutuskan dan menyunting NOTAM wilayahnya; NOF juga per wilayah', async () => {
    await mk('pia-jkt', 'PIA', ['JKT']);
    await mk('pia-sub', 'PIA', ['SUB']);
    await mk('nof-sub', 'NOF', ['SUB']);
    const id = await newSubmitted('PIA'); // WIHH
    await api('post', `/requests/${id}/decision`, 'pia-sub').send({ action: 'ACCEPT' }).expect(403);
    await api('put', `/requests/${id}/items`, 'pia-sub').send({ E: 'RWY 06/24 CLSD' }).expect(403);
    await api('post', `/requests/${id}/decision`, 'pia-jkt').send({ action: 'ACCEPT' }).expect(201);
    await api('post', `/requests/${id}/decision`, 'nof-sub').send({ action: 'ACCEPT' }).expect(403); // NOF wilayah lain
    await api('post', `/requests/${id}/decision`, 'nof').send({ action: 'ACCEPT' }).expect(201); // NOF tanpa wilayah
  });

  it('daftar dapat difilter menurut wilayah ("mine" dan kode)', async () => {
    const ids = (r: any) => r.body.map((x: any) => x.airport);
    const mine = await api('get', '/requests?region=mine', 'pia-sub').expect(200);
    assert.ok(ids(mine).every((a: string) => a === 'WARR'));
    const jkt = await api('get', '/requests?region=JKT', 'pia-jkt').expect(200);
    assert.ok(jkt.body.length > 0 && ids(jkt).every((a: string) => a === 'WIHH'));
    const none = await api('get', '/requests?region=TIDAKADA', 'adm').expect(200);
    assert.equal(none.body.length, 0);
  });

  it('mengubah wilayah pengguna dan menghapus wilayah melepasnya dari pengguna', async () => {
    const users = (await api('get', '/users', 'adm')).body as any[];
    const u = users.find((x) => x.username === 'pia-sub');
    assert.deepEqual(u.regions, ['SUB']);
    await api('patch', `/users/${u._id}`, 'adm').send({ regions: ['TIDAKADA'] }).expect(400);
    await api('patch', `/users/${u._id}`, 'adm').send({ regions: ['SUB', 'JKT'] }).expect(200);
    const del = (await api('delete', '/regions/SUB', 'adm').expect(200)).body;
    assert.ok(del.users >= 2);
    const after = ((await api('get', '/users', 'adm')).body as any[]).find((x) => x.username === 'pia-sub');
    assert.deepEqual(after.regions, ['JKT']);
    assert.equal((await api('get', '/me', 'pia-sub')).body.regions[0], 'JKT');
  });
});
