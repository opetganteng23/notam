import { Body, Controller, HttpException, HttpStatus, Post, Req, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Model } from 'mongoose';
import { AuditService } from '../audit/audit.service';
import { User } from '../requests/schemas';
import { Public } from './auth';
import { normalizeUsername } from '../users/rules';

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;

@Controller('auth')
export class AuthController {
  constructor(@InjectModel(User.name) private users: Model<User>, private jwt: JwtService, private audit: AuditService) {}

  // Pembatasan percobaan login per username+IP (di memori; hilang saat restart).
  private fails = new Map<string, { n: number; until: number }>();

  @Public() @Post('login')
  async login(@Body() b: { username: string; password: string }, @Req() req: { ip?: string }) {
    const name = String(b.username).slice(0, 64);
    const key = `${name}|${req.ip}`;
    const f = this.fails.get(key);
    if (f && f.n >= MAX_FAILS && f.until > Date.now()) {
      await this.audit.record({ actor: name, action: 'LOGIN_LOCKED', summary: `Login ditolak: terlalu banyak percobaan gagal (${name})`, ip: req.ip });
      throw new HttpException('Terlalu banyak percobaan, coba lagi nanti', HttpStatus.TOO_MANY_REQUESTS);
    }
    const u = await this.users.findOne({ username: normalizeUsername(b.username) });
    if (!u || !(await bcrypt.compare(String(b.password), u.passwordHash))) {
      if (this.fails.size > 1000) for (const [k, v] of this.fails) if (v.until <= Date.now()) this.fails.delete(k);
      const n = (f && f.until > Date.now() ? f.n : 0) + 1;
      this.fails.set(key, { n, until: Date.now() + LOCK_MS });
      await this.audit.record({ actor: name, action: 'LOGIN_FAIL', summary: `Login gagal untuk ${name} (percobaan ke-${n})`, ip: req.ip });
      throw new UnauthorizedException('Kredensial salah');
    }
    this.fails.delete(key);
    if (u.active === false) {
      await this.audit.record({ actor: u.username, role: u.role, action: 'LOGIN_BLOCKED', summary: `Login ditolak: akun ${u.username} dinonaktifkan`, ip: req.ip });
      throw new UnauthorizedException('Akun dinonaktifkan');
    }
    await this.users.updateOne({ _id: u._id }, { $set: { lastLoginAt: new Date() } });
    await this.audit.record({ actor: u.username, role: u.role, action: 'LOGIN_OK', summary: `${u.username} berhasil login`, ip: req.ip });
    return { token: await this.jwt.signAsync({ sub: String(u._id), username: u.username, role: u.role }) };
  }
}
