import { BadRequestException, Body, ConflictException, Controller, Get, Patch, Post, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Model } from 'mongoose';
import { AuditService } from '../audit/audit.service';
import { AuthUser, CurrentUser } from '../auth/auth';
import { NotamRequest, User } from '../requests/schemas';
import { MAX_NAME, MIN_PASSWORD, USERNAME_HINT, USERNAME_RE, cleanName, normalizeUsername } from './rules';

const view = (u: any) => ({ username: u.username, name: u.name ?? '', role: u.role, createdAt: u.createdAt ?? null, lastLoginAt: u.lastLoginAt ?? null, regions: u.regions ?? [] });

// Profil milik pengguna yang sedang login (semua role). Perubahan email dan password wajib password saat ini.
@Controller('me')
export class ProfileController {
  constructor(
    @InjectModel(User.name) private users: Model<User>,
    @InjectModel(NotamRequest.name) private requests: Model<NotamRequest>,
    private jwt: JwtService,
    private audit: AuditService,
  ) {}

  private async verify(me: AuthUser, password: unknown) {
    const u = await this.users.findById(me.sub);
    if (!u) throw new UnauthorizedException();
    if (typeof password !== 'string' || !(await bcrypt.compare(password, u.passwordHash))) throw new BadRequestException('Password saat ini salah');
    return u;
  }

  @Get()
  async get(@CurrentUser() me: AuthUser) {
    const u = await this.users.findById(me.sub).lean();
    if (!u) throw new UnauthorizedException();
    return view(u);
  }

  @Patch()
  async update(@CurrentUser() me: AuthUser, @Body() b: { name?: string }) {
    const name = cleanName(b.name);
    if (name.length > MAX_NAME) throw new BadRequestException(`Nama maksimal ${MAX_NAME} karakter`);
    const u = await this.users.findByIdAndUpdate(me.sub, { $set: { name } }, { returnDocument: 'after' }).lean();
    if (!u) throw new UnauthorizedException();
    await this.audit.record({ actor: me.username, role: me.role, action: 'PROFILE_UPDATE', target: me.username, summary: `Mengubah nama profil menjadi "${name || '(kosong)'}"` });
    return view(u);
  }

  @Post('password')
  async password(@CurrentUser() me: AuthUser, @Body() b: { current?: string; next?: string }) {
    const u = await this.verify(me, b.current);
    if (typeof b.next !== 'string' || b.next.length < MIN_PASSWORD) throw new BadRequestException(`Password baru minimal ${MIN_PASSWORD} karakter`);
    if (b.next === b.current) throw new BadRequestException('Password baru harus berbeda dari password saat ini');
    u.passwordHash = await bcrypt.hash(b.next, 10);
    await u.save();
    await this.audit.record({ actor: me.username, role: me.role, action: 'PROFILE_PASSWORD', target: me.username, summary: `${me.username} mengganti password sendiri` });
    return { ok: true };
  }

  // Username dipakai sebagai pemilik NOTAM, jadi kepemilikan ikut dipindahkan. Riwayat lama tetap mencatat nama lama.
  @Post('username')
  async username(@CurrentUser() me: AuthUser, @Body() b: { username?: string; current?: string }) {
    const next = normalizeUsername(b.username);
    if (!USERNAME_RE.test(next)) throw new BadRequestException(USERNAME_HINT);
    const u = await this.verify(me, b.current);
    const old = u.username;
    if (next === old) throw new BadRequestException('Email/username baru sama dengan yang sekarang');
    if (await this.users.exists({ username: next })) throw new ConflictException('Email/username sudah dipakai akun lain');
    u.username = next;
    try { await u.save(); } catch (e: any) {
      if (e?.code === 11000) throw new ConflictException('Email/username sudah dipakai akun lain');
      throw e;
    }
    const moved = await this.requests.updateMany({ originator: old }, { $set: { originator: next } });
    await this.audit.record({ actor: old, role: me.role, action: 'PROFILE_USERNAME', target: next, summary: `Mengganti email/username dari ${old} menjadi ${next} (${moved.modifiedCount} NOTAM ikut dipindahkan)`, detail: { from: old, to: next, moved: moved.modifiedCount } });
    return { ...view(u), token: await this.jwt.signAsync({ sub: String(u._id), username: u.username, role: u.role }) };
  }
}
