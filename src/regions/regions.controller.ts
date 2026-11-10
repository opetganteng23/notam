import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditService } from '../audit/audit.service';
import { AuthUser, CurrentUser, Roles } from '../auth/auth';
import { findAirport } from '../master/airports';
import { Region, User } from '../requests/schemas';
import { MAX_REGION_NAME, REGION_CODE } from './scope';

const view = (r: any, users = 0) => ({ code: r.code, name: r.name, airports: r.airports ?? [], users });

// Daftar wilayah dapat dibaca semua pengguna yang login (untuk filter); mengelola wilayah hanya ADMIN.
@Controller('regions')
export class RegionsController {
  constructor(@InjectModel(Region.name) private regions: Model<Region>, @InjectModel(User.name) private users: Model<User>, private audit: AuditService) {}

  private rec(me: AuthUser, action: string, target: string, summary: string, detail?: Record<string, unknown>) {
    return this.audit.record({ actor: me.username, role: me.role, action, target, summary, detail });
  }

  private cleanName(v: unknown) {
    const n = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
    if (!n) throw new BadRequestException('Nama wilayah wajib diisi');
    if (n.length > MAX_REGION_NAME) throw new BadRequestException(`Nama wilayah maksimal ${MAX_REGION_NAME} karakter`);
    return n;
  }

  // Locator dirapikan, harus ada di master bandara, dan satu bandara hanya boleh di satu wilayah.
  private async cleanAirports(v: unknown, self?: string) {
    const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\s,;]+/) : [];
    const list = [...new Set(raw.map((x) => String(x).trim().toUpperCase()).filter(Boolean))];
    const unknown = list.filter((a) => !/^[A-Z]{4}$/.test(a) || !findAirport(a));
    if (unknown.length) throw new BadRequestException(`Locator tidak ada di master bandara: ${unknown.join(', ')}`);
    const taken = await this.regions.find({ airports: { $in: list }, ...(self ? { code: { $ne: self } } : {}) }).lean();
    const clash = list.filter((a) => taken.some((r) => r.airports.includes(a)));
    if (clash.length) throw new ConflictException(`Bandara sudah ada di wilayah lain: ${clash.map((a) => `${a} (${taken.find((r) => r.airports.includes(a))!.code})`).join(', ')}`);
    return list;
  }

  @Get()
  async list(@CurrentUser() me: AuthUser) {
    const all = await this.regions.find().sort({ code: 1 }).lean();
    const counts = me.role === 'ADMIN' ? await this.users.aggregate([{ $unwind: '$regions' }, { $group: { _id: '$regions', n: { $sum: 1 } } }]) : [];
    return all.map((r) => view(r, counts.find((c) => c._id === r.code)?.n ?? 0));
  }

  @Roles('ADMIN') @Post()
  async create(@CurrentUser() me: AuthUser, @Body() b: { code?: string; name?: string; airports?: unknown }) {
    const code = String(b.code ?? '').trim().toUpperCase();
    if (!REGION_CODE.test(code)) throw new BadRequestException('Kode wilayah 2-20 karakter: huruf besar, angka, minus, atau garis bawah');
    const name = this.cleanName(b.name);
    if (await this.regions.exists({ code })) throw new ConflictException('Kode wilayah sudah dipakai');
    const airports = await this.cleanAirports(b.airports);
    const r = await this.regions.create({ code, name, airports });
    await this.rec(me, 'REGION_CREATE', code, `Membuat wilayah ${code} (${name}) dengan ${airports.length} bandara`, { airports });
    return view(r);
  }

  @Roles('ADMIN') @Patch(':code')
  async update(@CurrentUser() me: AuthUser, @Param('code') code: string, @Body() b: { name?: string; airports?: unknown }) {
    const before = await this.regions.findOne({ code }).lean();
    if (!before) throw new NotFoundException();
    const set: Record<string, unknown> = {};
    if (b.name !== undefined) set.name = this.cleanName(b.name);
    if (b.airports !== undefined) set.airports = await this.cleanAirports(b.airports, code);
    if (!Object.keys(set).length) throw new BadRequestException('Tidak ada perubahan');
    const r = await this.regions.findOneAndUpdate({ code }, { $set: set }, { returnDocument: 'after' }).lean();
    const added = ((set.airports as string[]) ?? before.airports).filter((a) => !before.airports.includes(a));
    const removed = before.airports.filter((a) => !((set.airports as string[]) ?? before.airports).includes(a));
    await this.rec(me, 'REGION_UPDATE', code, `Mengubah wilayah ${code}${set.name ? `, nama "${set.name}"` : ''}${added.length ? `, menambah ${added.join(', ')}` : ''}${removed.length ? `, mengeluarkan ${removed.join(', ')}` : ''}`, { added, removed });
    return view(r);
  }

  // Menghapus wilayah juga melepasnya dari semua pengguna; pengguna tanpa wilayah tidak dibatasi.
  @Roles('ADMIN') @Delete(':code')
  async remove(@CurrentUser() me: AuthUser, @Param('code') code: string) {
    const r = await this.regions.findOneAndDelete({ code }).lean();
    if (!r) throw new NotFoundException();
    const { modifiedCount } = await this.users.updateMany({ regions: code }, { $pull: { regions: code } });
    await this.rec(me, 'REGION_DELETE', code, `Menghapus wilayah ${code} (${r.name}); dilepas dari ${modifiedCount} pengguna`, { users: modifiedCount });
    return { deleted: true, users: modifiedCount };
  }
}
