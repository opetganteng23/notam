import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthUser } from '../auth/auth';
import { NOTAM_GENERATOR, NotamGenerator } from '../generator/generator';
import { endBeforeStart } from './input-check';
import { findAirport, mentionedAirportNames, mentionedLocators } from '../master/airports';
import { Action, Route, WorkflowError, transition } from '../workflow/workflow';
import { AuditService } from '../audit/audit.service';
import { OpsService } from '../ops/ops.service';
import { NotamRequest } from './schemas';

// Aturan MoM: tanggal harus spesifik, bukan relatif.
const RELATIVE_DATE = /\b(hari ini|besok|kemarin|today|tomorrow|yesterday)\b/i;

// Dataset terpanjang 726 karakter; batas melindungi LLM dari input berlebihan.
const MAX_FREE_TEXT = 3000;

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

export interface ListQuery {
  status?: string;
  airport?: string;
  q?: string;
  from?: string;
  to?: string;
}

// Kesalahan yang pasti salah; draf dengan kesalahan ini tidak boleh dikirim ke peninjau.
export const BLOCKING = ['A_MISMATCH', 'C_BEFORE_B'];

@Injectable()
export class RequestsService {
  private log = new Logger(RequestsService.name);

  constructor(
    @InjectModel(NotamRequest.name) private model: Model<NotamRequest>,
    @Inject(NOTAM_GENERATOR) private generator: NotamGenerator,
    private ops: OpsService,
    private audit: AuditService,
  ) {}

  private async nextFormNo() {
    const n = (await this.model.countDocuments()) + 1;
    return `FRM-${new Date().getUTCFullYear()}-${String(n).padStart(5, '0')}`;
  }

  private async load(id: string) {
    const doc = await this.model.findById(id).catch(() => null);
    if (!doc) throw new NotFoundException();
    return doc;
  }

  // Kegagalan LLM dilaporkan jelas (503) dan tidak menyimpan apa pun; alur review lain tidak terpengaruh.
  // Gerbang/kuota/antrean ada di OpsService; di sini hanya menerjemahkan kegagalan LLM.
  private async generate(user: AuthUser, freeText: string, airport: string) {
    const { result, ms } = await this.ops.guarded(user, async () => {
      try {
        return await this.generator.generate({ freeText, airport });
      } catch (e) {
        this.log.error(`Generate gagal: ${(e as Error).message}`);
        throw new ServiceUnavailableException('Layanan LLM tidak tersedia atau gagal merespons. Coba lagi beberapa saat.');
      }
    });
    return { ...result, ms };
  }

  private checkInput(freeText: string, airport: string) {
    if (!freeText?.trim()) throw new BadRequestException('Teks freeform wajib diisi');
    if (freeText.length > MAX_FREE_TEXT) throw new BadRequestException(`Teks freeform maksimal ${MAX_FREE_TEXT} karakter`);
    if (RELATIVE_DATE.test(freeText)) throw new BadRequestException('Tanggal harus spesifik, bukan "hari ini"/"besok"');
    const other = mentionedLocators(freeText).filter((l) => l !== airport);
    if (other.length) throw new BadRequestException(`Locator di teks (${other.join(', ')}) tidak sama dengan bandara ${airport}`);
    if (endBeforeStart(freeText)) throw new BadRequestException('Tanggal atau jam selesai lebih awal dari waktu mulai. Periksa kembali tanggalnya.');
    const named = mentionedAirportNames(freeText, airport);
    if (named.length) throw new BadRequestException(`Teks menyebut bandara ${named.map((a) => `${a.name} (${a.locId})`).join(', ')}, tetapi locator pengajuan adalah ${airport}. Perbaiki locator atau teksnya.`);
  }

  async create(user: AuthUser, airport: string, freeText: string, reuseOf?: string) {
    if (!findAirport(airport)) throw new BadRequestException('Locator bandara tidak ada di master data');
    this.checkInput(freeText, airport);
    if (reuseOf) {
      const src = await this.load(reuseOf);
      if (src.originator !== user.username) throw new ForbiddenException();
      if (norm(src.versions[src.versions.length - 1].freeText) === norm(freeText))
        throw new BadRequestException('Teks yang dipakai ulang harus diubah dari permintaan sebelumnya');
    }
    const gen = await this.generate(user, freeText, airport);
    const doc = await this.model.create({
      formNo: await this.nextFormNo(),
      airport,
      originator: user.username,
      versions: [{ no: 1, freeText, generated: gen.text, corrections: gen.corrections, provider: gen.provider, model: gen.model, validation: gen.validation, ms: gen.ms }],
    });
    await this.rec(user, 'REQUEST_CREATE', doc.formNo, `Membuat ${doc.formNo} untuk ${airport} (validasi ${gen.validation.status})${reuseOf ? ', dari teks yang dipakai ulang' : ''}`);
    return doc;
  }

  private rec(user: AuthUser, action: string, target: string, summary: string, detail?: Record<string, unknown>) {
    return this.audit.record({ actor: user.username, role: user.role, action, target, summary, detail });
  }

  // Revisi dilakukan pada teks freeform; setiap generate membuat versi baru.
  async revise(user: AuthUser, id: string, freeText: string) {
    const doc = await this.load(id);
    if (doc.originator !== user.username) throw new ForbiddenException();
    if (doc.status !== 'DRAFT' && doc.status !== 'REVISION_REQUIRED')
      throw new ConflictException(`Teks tidak dapat diubah pada status ${doc.status}`);
    this.checkInput(freeText, doc.airport);
    const last = doc.versions[doc.versions.length - 1];
    if (norm(last.freeText) === norm(freeText)) throw new BadRequestException('Teks harus diubah dari versi sebelumnya');
    const gen = await this.generate(user, freeText, doc.airport);
    doc.versions.push({ no: last.no + 1, freeText, generated: gen.text, corrections: gen.corrections, provider: gen.provider, model: gen.model, validation: gen.validation, ms: gen.ms } as any);
    const saved = await doc.save();
    await this.rec(user, 'REQUEST_TEXT', doc.formNo, `Mengubah teks ${doc.formNo} dan generate ulang (versi ${last.no + 1})`);
    return saved;
  }

  async act(user: AuthUser, id: string, action: Action, opts: { route?: Route; note?: string }) {
    const doc = await this.load(id);
    if (action === 'SUBMIT' && doc.originator !== user.username) throw new ForbiddenException();
    const blocking = (doc.versions[doc.versions.length - 1]?.validation?.issues ?? []).filter((i) => BLOCKING.includes(i.code));
    if (action === 'SUBMIT' && blocking.length)
      throw new BadRequestException(`Draf belum dapat di-submit: ${blocking.map((i) => i.message).join('; ')}. Perbaiki teks atau locator lalu Generate ulang.`);
    let res;
    try {
      res = transition({ status: doc.status, action, role: user.role, route: opts.route, note: opts.note, piaRevisionCount: doc.piaRevisionCount });
    } catch (e) {
      if (e instanceof WorkflowError) throw new ConflictException(e.message);
      throw e;
    }
    // Update kondisional pada status lama agar dua aksi bersamaan tidak sama-sama lolos.
    const updated = await this.model.findOneAndUpdate(
      { _id: id, status: doc.status },
      {
        $set: { status: res.next, ...(opts.route ? { route: opts.route } : {}) },
        ...(res.countsAsPiaRevision ? { $inc: { piaRevisionCount: 1 } } : {}),
        $push: { events: { actor: user.username, role: user.role, action, from: doc.status, to: res.next, note: opts.note, at: new Date() } },
      },
      { returnDocument: 'after' },
    );
    if (!updated) throw new ConflictException('Status berubah oleh proses lain, muat ulang');
    await this.rec(user, `REQUEST_${action}`, updated.formNo, `${action} ${updated.formNo}: ${doc.status} → ${res.next}${opts.note ? ` — ${opts.note}` : ''}`, { from: doc.status, to: res.next, note: opts.note, route: opts.route });
    return updated;
  }

  // Originator hanya melihat miliknya; role lain (termasuk admin) melihat semua yang sudah disubmit.
  private scope(user: AuthUser): Record<string, any> {
    return user.role === 'ORIGINATOR' ? { originator: user.username } : { status: { $ne: 'DRAFT' } };
  }

  async stats(user: AuthUser) {
    const $match = this.scope(user);
    const group = (_id: unknown) => [{ $match }, { $group: { _id, n: { $sum: 1 } } }];
    const [status, airport, month, recent] = await Promise.all([
      this.model.aggregate(group('$status')),
      this.model.aggregate([...group('$airport'), { $sort: { n: -1, _id: 1 } }, { $limit: 5 }]),
      this.model.aggregate([...group({ $dateToString: { format: '%Y-%m', date: '$createdAt' } }), { $sort: { _id: -1 } }, { $limit: 6 }]),
      this.model.aggregate([
            { $match }, { $unwind: '$events' }, { $sort: { 'events.at': -1 } }, { $limit: 15 },
            { $project: { _id: 0, formNo: 1, airport: 1, actor: '$events.actor', role: '$events.role', action: '$events.action', to: '$events.to', at: '$events.at' } },
          ]),
    ]);
    const byStatus = Object.fromEntries(status.map((s) => [s._id, s.n]));
    return {
      total: status.reduce((a, s) => a + s.n, 0),
      byStatus,
      byAirport: airport.map((a) => ({ airport: a._id, n: a.n })),
      byMonth: month.reverse().map((m) => ({ month: m._id, n: m.n })),
      recent,
    };
  }

  async list(user: AuthUser, f: ListQuery) {
    const filter = this.scope(user);
    if (f.status) filter.status = String(f.status);
    if (f.airport) filter.airport = String(f.airport);
    if (f.from || f.to) filter.createdAt = { ...(f.from && { $gte: new Date(f.from) }), ...(f.to && { $lte: new Date(f.to) }) };
    if (f.q) {
      const re = new RegExp(String(f.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ formNo: re }, { 'versions.freeText': re }, { 'versions.generated': re }];
    }
    return this.model.find(filter).sort({ createdAt: -1 });
  }

  async get(user: AuthUser, id: string) {
    const doc = await this.load(id);
    if (user.role === 'ORIGINATOR' ? doc.originator !== user.username : doc.status === 'DRAFT') throw new NotFoundException();
    return doc;
  }
}
