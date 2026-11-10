import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model } from 'mongoose';
import { AuditService } from '../audit/audit.service';
import { AuthUser, CurrentUser, Roles } from '../auth/auth';
import { Region, User } from '../requests/schemas';
import { Role } from '../workflow/workflow';
import { MAX_NAME, MIN_PASSWORD, USERNAME_HINT, USERNAME_RE, cleanName, normalizeUsername } from './rules';

const ROLES: Role[] = ['ORIGINATOR', 'ATS', 'PIA', 'NOF', 'ADMIN'];
const view = (u: any) => ({ _id: u._id, username: u.username, name: u.name ?? '', role: u.role, active: u.active !== false, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt ?? null, regions: u.regions ?? [] });

// Manajemen akun: hanya ADMIN.
@Controller('users')
export class UsersController {
  constructor(@InjectModel(User.name) private users: Model<User>, @InjectModel(Region.name) private regions: Model<Region>, private audit: AuditService) {}

  private rec(me: AuthUser, action: string, target: string, summary: string, detail?: Record<string, unknown>) {
    return this.audit.record({ actor: me.username, role: me.role, action, target, summary, detail });
  }

  private checkPassword(p: unknown) {
    if (typeof p !== 'string' || p.length < MIN_PASSWORD) throw new BadRequestException(`Password minimal ${MIN_PASSWORD} karakter`);
  }
  private checkRole(r: unknown) {
    if (!ROLES.includes(r as Role)) throw new BadRequestException(`Role harus salah satu dari ${ROLES.join(', ')}`);
  }

  // Kode wilayah harus ada; daftar dirapikan (unik, huruf besar).
  private async checkRegions(v: unknown) {
    if (!Array.isArray(v)) throw new BadRequestException('Wilayah harus berupa daftar kode');
    const codes = [...new Set(v.map((x) => String(x).trim().toUpperCase()).filter(Boolean))];
    const known = new Set((await this.regions.find({ code: { $in: codes } }).lean()).map((r) => r.code));
    const unknown = codes.filter((c) => !known.has(c));
    if (unknown.length) throw new BadRequestException(`Wilayah tidak dikenal: ${unknown.join(', ')}`);
    return codes;
  }

  @Roles('ADMIN') @Get()
  async list() {
    return (await this.users.find().sort({ username: 1 })).map(view);
  }

  @Roles('ADMIN') @Post()
  async create(@CurrentUser() me: AuthUser, @Body() b: { username: string; password: string; role: Role; name?: string; regions?: string[] }) {
    const name = cleanName(b.name);
    if (name.length > MAX_NAME) throw new BadRequestException(`Nama maksimal ${MAX_NAME} karakter`);
    const username = normalizeUsername(b.username);
    if (!USERNAME_RE.test(username)) throw new BadRequestException(USERNAME_HINT);
    this.checkPassword(b.password);
    this.checkRole(b.role);
    const regions = b.regions === undefined ? [] : await this.checkRegions(b.regions);
    try {
      const u = await this.users.create({ username, name, role: b.role, passwordHash: await bcrypt.hash(b.password, 10), regions });
      await this.rec(me, 'USER_CREATE', u.username, `Membuat akun ${u.username} (${u.role})${regions.length ? `, wilayah ${regions.join(', ')}` : ''}`, { role: u.role, regions });
      return view(u);
    } catch (e: any) {
      if (e?.code === 11000) throw new ConflictException('Username sudah dipakai');
      throw e;
    }
  }

  @Roles('ADMIN') @Patch(':id')
  async update(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() b: { role?: Role; active?: boolean; password?: string; name?: string; regions?: string[] }) {
    const set: Record<string, unknown> = {};
    if (b.name !== undefined) { const n = cleanName(b.name); if (n.length > MAX_NAME) throw new BadRequestException(`Nama maksimal ${MAX_NAME} karakter`); set.name = n; }
    if (b.role !== undefined) { this.checkRole(b.role); set.role = b.role; }
    if (b.active !== undefined) set.active = !!b.active;
    if (b.password !== undefined) { this.checkPassword(b.password); set.passwordHash = await bcrypt.hash(b.password, 10); }
    if (b.regions !== undefined) set.regions = await this.checkRegions(b.regions);
    if (!Object.keys(set).length) throw new BadRequestException('Tidak ada perubahan');
    if (id === me.sub && (set.active === false || (set.role && set.role !== me.role))) throw new BadRequestException('Tidak dapat menonaktifkan atau mengubah role akun sendiri');
    const before = await this.users.findById(id).catch(() => null);
    const u = await this.users.findByIdAndUpdate(id, { $set: set }, { returnDocument: 'after' }).catch(() => null);
    if (!u || !before) throw new NotFoundException();
    const changes: string[] = [];
    const detail: Record<string, unknown> = {};
    if (set.role && set.role !== before.role) { changes.push(`role ${before.role} → ${u.role}`); detail.role = { from: before.role, to: u.role }; }
    if (set.active !== undefined && (set.active as boolean) !== (before.active !== false)) { changes.push(u.active ? 'diaktifkan' : 'dinonaktifkan'); detail.active = { from: before.active !== false, to: u.active }; }
    if (set.name !== undefined && set.name !== (before.name ?? '')) { changes.push(`nama menjadi "${set.name}"`); detail.name = { from: before.name ?? '', to: set.name }; }
    if (set.regions && JSON.stringify(set.regions) !== JSON.stringify(before.regions ?? [])) { changes.push(`wilayah ${(before.regions ?? []).join(', ') || '(tidak dibatasi)'} → ${(set.regions as string[]).join(', ') || '(tidak dibatasi)'}`); detail.regions = { from: before.regions ?? [], to: set.regions }; }
    if (set.passwordHash) { changes.push('password direset'); detail.passwordReset = true; }
    if (changes.length) await this.rec(me, 'USER_UPDATE', u.username, `Mengubah akun ${u.username}: ${changes.join(', ')}`, detail);
    return view(u);
  }

  // Hapus hanya untuk akun nonaktif dan bukan akun sendiri. NOTAM yang pernah dibuat tetap tersimpan (mengacu ke username).
  @Roles('ADMIN') @Delete(':id')
  async remove(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    if (id === me.sub) throw new BadRequestException('Tidak dapat menghapus akun sendiri');
    const u = await this.users.findById(id).catch(() => null);
    if (!u) throw new NotFoundException();
    if (u.active !== false) throw new ConflictException('Nonaktifkan akun terlebih dahulu sebelum menghapus');
    await u.deleteOne();
    await this.rec(me, 'USER_DELETE', u.username, `Menghapus akun ${u.username} (${u.role})`, { role: u.role });
    return { deleted: true };
  }
}
