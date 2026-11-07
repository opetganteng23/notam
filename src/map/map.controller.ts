import { BadRequestException, Controller, Get, Injectable, NotFoundException, Param, Query } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthUser, CurrentUser } from '../auth/auth';
import { findAirport } from '../master/airports';
import { NotamRequest } from '../requests/schemas';
import { Item, MapDoc, MapFilter, ValidityState, buildPoints, canSee, parseValidity, selectItems, timeline, validityState } from './map';

export interface MapQuery { from?: string; to?: string; by?: string; status?: string; fir?: string; state?: string; all?: string; page?: string; pageSize?: string }

const STATUSES = ['DRAFT', 'UNDER_ATS', 'UNDER_PIA', 'UNDER_NOF', 'REVISION_REQUIRED', 'REJECTED', 'APPROVED_BY_NOF'];
const STATES = ['active', 'upcoming', 'expired'];

@Injectable()
export class MapService {
  constructor(@InjectModel(NotamRequest.name) private model: Model<NotamRequest>) {}

  // Draft hanya terlihat oleh pembuatnya. Originator melihat miliknya (semua status) dan NOTAM orang lain yang sudah disetujui NOF.
  // Role lain (ATS, PIA, NOF, Admin) melihat semua yang sudah disubmit.
  private scope(u: AuthUser): Record<string, unknown> {
    return u.role === 'ORIGINATOR' ? { $or: [{ originator: u.username }, { status: 'APPROVED_BY_NOF' }] } : { status: { $ne: 'DRAFT' } };
  }

  private parse(q: MapQuery): MapFilter {
    const date = (k: 'from' | 'to') => {
      if (!q[k]) return undefined;
      const d = new Date(q[k] as string);
      if (Number.isNaN(d.getTime())) throw new BadRequestException(`Tanggal ${k} tidak valid`);
      return d;
    };
    const from = date('from'), to = date('to');
    if (from && to && from > to) throw new BadRequestException('Tanggal awal harus sebelum tanggal akhir');
    if (q.by && q.by !== 'created' && q.by !== 'validity') throw new BadRequestException('Parameter by harus created atau validity');
    if (q.status && !STATUSES.includes(q.status)) throw new BadRequestException('Status tidak dikenal');
    if (q.fir && !/^[A-Z]{4}$/.test(q.fir)) throw new BadRequestException('FIR harus 4 huruf kapital');
    if (q.state && !STATES.includes(q.state)) throw new BadRequestException('State harus active, upcoming, atau expired');
    return { from, to, by: q.by === 'validity' ? 'validity' : 'created', status: q.status, fir: q.fir, state: q.state as ValidityState | undefined };
  }

  private async fetch(u: AuthUser, extra: Record<string, unknown> = {}): Promise<MapDoc[]> {
    const docs = (await this.model
      .find({ $and: [this.scope(u), extra] })
      .select({ formNo: 1, airport: 1, originator: 1, status: 1, createdAt: 1, versions: { $slice: -1 } })
      .lean()) as unknown as MapDoc[];
    return docs.filter((d) => canSee(u, d));
  }

  async overview(u: AuthUser, q: MapQuery) {
    const f = this.parse(q);
    const items = selectItems(await this.fetch(u), f, u.username);
    return { total: items.length, ...buildPoints(items, q.all === '1'), generatedAt: new Date().toISOString() };
  }

  async airport(u: AuthUser, code: string, q: MapQuery) {
    if (!/^[A-Z]{4}$/.test(code)) throw new BadRequestException('Kode bandara harus 4 huruf kapital');
    const f = this.parse(q);
    const items = selectItems(await this.fetch(u, { airport: code }), f, u.username)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    const size = Math.min(50, Math.max(1, Number(q.pageSize) || 10));
    const pages = Math.max(1, Math.ceil(items.length / size));
    const page = Math.min(pages, Math.max(1, Number(q.page) || 1));
    const counts: Record<string, number> = {};
    for (const i of items) counts[i.status] = (counts[i.status] ?? 0) + 1;
    const ap = findAirport(code);
    return {
      airport: { code, name: ap?.name ?? '', city: ap?.city ?? '', fir: ap?.fir ?? '' },
      total: items.length, counts, timeline: timeline(items), page, pages, pageSize: size,
      items: items.slice((page - 1) * size, page * size) as Item[],
    };
  }

  // Detail satu NOTAM. Pembuat dan peran review/admin melihat riwayat dan pesan asli; Originator lain hanya NOTAM final-nya.
  async detail(u: AuthUser, formNo: string) {
    const doc = await this.model.findOne({ $and: [this.scope(u), { formNo }] }).lean();
    if (!doc || !canSee(u, doc)) throw new NotFoundException();
    const last = doc.versions[doc.versions.length - 1];
    const v = parseValidity(last?.generated);
    const full = u.role !== 'ORIGINATOR' || doc.originator === u.username;
    return {
      formNo: doc.formNo, airport: doc.airport, airportName: findAirport(doc.airport)?.name ?? '', status: doc.status, createdAt: (doc as unknown as { createdAt: Date }).createdAt,
      generated: last?.generated ?? '', validFrom: v?.from ?? null, validTo: v?.to ?? null, perm: !!v?.perm,
      state: doc.status === 'APPROVED_BY_NOF' ? validityState(v, new Date()) : null,
      ...(full && {
        originator: doc.originator, prompt: last?.freeText ?? '', validation: last?.validation?.status ?? null,
        events: [...(doc.events ?? [])].sort((a, b) => +new Date(a.at) - +new Date(b.at)).map((e) => ({ actor: e.actor, role: e.role, action: e.action, to: e.to, at: e.at, note: e.note })),
      }),
    };
  }
}

// Peta sebaran terbuka untuk semua peran yang sudah login; isi data dibatasi oleh MapService.scope.
@Controller('map')
export class MapController {
  constructor(private svc: MapService) {}

  @Get() overview(@CurrentUser() u: AuthUser, @Query() q: MapQuery) { return this.svc.overview(u, q); }
  @Get('airport/:code') airport(@CurrentUser() u: AuthUser, @Param('code') code: string, @Query() q: MapQuery) { return this.svc.airport(u, code, q); }
  @Get('notam/:formNo') detail(@CurrentUser() u: AuthUser, @Param('formNo') formNo: string) { return this.svc.detail(u, formNo); }
}
