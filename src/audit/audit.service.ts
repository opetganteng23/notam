import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog } from '../requests/schemas';

export interface AuditEntry {
  actor: string;
  role?: string;
  action: string; // KATEGORI_AKSI, mis. USER_DELETE
  target?: string;
  summary: string;
  detail?: Record<string, unknown>;
  ip?: string;
}

export interface AuditQuery {
  q?: string;
  category?: string;
  actor?: string;
  from?: string;
  to?: string;
  limit?: string;
  skip?: string;
}

const CATEGORIES = ['LOGIN', 'USER', 'SERVER', 'REQUEST'];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

@Injectable()
export class AuditService {
  private log = new Logger(AuditService.name);

  constructor(@InjectModel(AuditLog.name) private model: Model<AuditLog>) {}

  // Kegagalan mencatat tidak boleh menggagalkan aksi pengguna; hanya dilaporkan ke log server.
  async record(e: AuditEntry) {
    try {
      await this.model.create(e);
    } catch (err) {
      this.log.error(`Gagal mencatat audit ${e.action}: ${(err as Error).message}`);
    }
  }

  private filter(q: AuditQuery) {
    const f: Record<string, any> = {};
    if (q.category) {
      if (!CATEGORIES.includes(q.category)) throw new BadRequestException(`Kategori harus salah satu dari ${CATEGORIES.join(', ')}`);
      f.action = new RegExp(`^${q.category}_`);
    }
    if (q.actor) f.actor = new RegExp(`^${esc(String(q.actor))}`, 'i');
    for (const [k, v] of [['from', q.from], ['to', q.to]] as const) {
      if (!v) continue;
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) throw new BadRequestException(`Tanggal ${k} tidak valid`);
      f.at = { ...f.at, [k === 'from' ? '$gte' : '$lte']: d };
    }
    if (q.q) {
      const re = new RegExp(esc(String(q.q)), 'i');
      f.$or = [{ actor: re }, { target: re }, { summary: re }, { action: re }];
    }
    return f;
  }

  async list(q: AuditQuery) {
    const filter = this.filter(q);
    const limit = Math.min(Math.max(Number(q.limit) || 25, 1), 100);
    const skip = Math.max(Number(q.skip) || 0, 0);
    const [items, total] = await Promise.all([
      this.model.find(filter).sort({ at: -1, _id: -1 }).skip(skip).limit(limit).lean(),
      this.model.countDocuments(filter),
    ]);
    return { items, total };
  }

  // CSV untuk arsip; sel yang diawali = + - @ diberi apostrof agar tidak dieksekusi sebagai rumus di Excel.
  async csv(q: AuditQuery) {
    const rows = await this.model.find(this.filter(q)).sort({ at: -1, _id: -1 }).limit(5000).lean();
    const cell = (v: unknown) => {
      const s = String(v ?? '');
      return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
    };
    return [['Waktu (UTC)', 'Pelaku', 'Role', 'Aksi', 'Target', 'Keterangan', 'IP'].map(cell).join(',')]
      .concat(rows.map((r) => [r.at.toISOString(), r.actor, r.role, r.action, r.target, r.summary, r.ip].map(cell).join(',')))
      .join('\r\n');
  }
}
