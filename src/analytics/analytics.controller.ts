import { BadRequestException, Controller, Get, Injectable, Query, StreamableFile } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditService } from '../audit/audit.service';
import { AuthUser, CurrentUser, Roles } from '../auth/auth';
import { NotamRequest } from '../requests/schemas';
import { Analytics, DocLike, Row, buildInsights, computeAnalytics } from './analytics';
import { typesToExcel, typesToPptx } from './export-types';
import { analyticsToExcel } from './export-xlsx';
import { analyticsToPptx } from './export-pptx';
import { findAirport } from '../master/airports';
import { IMPACTS, TypeDoc, TypeRow, TypesReport, computeTypes, impactOf } from './types';

export interface AnalyticsQuery { from?: string; to?: string; airport?: string }
export interface TypesQuery extends AnalyticsQuery { status?: string; group?: string; subject?: string; condition?: string; impact?: string }

const STATUSES = ['UNDER_ATS', 'UNDER_PIA', 'UNDER_NOF', 'REVISION_REQUIRED', 'REJECTED', 'APPROVED_BY_NOF'];

@Injectable()
export class AnalyticsService {
  constructor(@InjectModel(NotamRequest.name) private model: Model<NotamRequest>) {}

  // Draft tidak pernah dihitung. Parameter tidak valid ditolak dengan pesan yang jelas.
  private filter(q: TypesQuery, allowStatus: boolean) {
    const date = (name: 'from' | 'to') => {
      if (!q[name]) return undefined;
      const d = new Date(q[name] as string);
      if (Number.isNaN(d.getTime())) throw new BadRequestException(`Tanggal ${name} tidak valid`);
      return d;
    };
    const from = date('from'), to = date('to');
    if (from && to && from > to) throw new BadRequestException('Tanggal awal harus sebelum tanggal akhir');
    if (q.airport && !/^[A-Z]{4}$/.test(q.airport)) throw new BadRequestException('Bandara harus 4 huruf kapital');
    if (allowStatus && q.status && !STATUSES.includes(q.status)) throw new BadRequestException(`Status harus salah satu dari ${STATUSES.join(', ')}`);
    const filter: Record<string, unknown> = { status: allowStatus && q.status ? q.status : { $ne: 'DRAFT' } };
    if (from || to) filter.createdAt = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
    if (q.airport) filter.airport = q.airport;
    return { filter, from, to };
  }

  async run(q: AnalyticsQuery): Promise<{ analytics: Analytics; rows: Row[] }> {
    const { filter, from, to } = this.filter(q, false);
    const docs = await this.model
      .find(filter)
      .select({ formNo: 1, airport: 1, originator: 1, status: 1, createdAt: 1, events: 1, versions: { $slice: -1 } })
      .lean();
    const result = computeAnalytics(docs as unknown as DocLike[], { from, to, airport: q.airport });
    // Periode pembanding: rentang sebelumnya dengan durasi yang sama persis. Hanya bila ada tanggal awal.
    if (from) {
      const end = to ?? new Date();
      const prevFrom = new Date(+from - (+end - +from));
      const prevFilter: Record<string, unknown> = { status: { $ne: 'DRAFT' }, createdAt: { $gte: prevFrom, $lt: from } };
      if (q.airport) prevFilter.airport = q.airport;
      const prevDocs = await this.model
        .find(prevFilter)
        .select({ formNo: 1, airport: 1, originator: 1, status: 1, createdAt: 1, events: 1, versions: { $slice: -1 } })
        .lean();
      const prev = computeAnalytics(prevDocs as unknown as DocLike[], { from: prevFrom, to: from, airport: q.airport }).analytics;
      result.analytics.previous = { from: prevFrom.toISOString(), to: from.toISOString(), kpi: prev.kpi, stages: prev.stages };
      result.analytics.insights = buildInsights(result.analytics);
    }
    return result;
  }

  async runTypes(q: TypesQuery): Promise<{ report: TypesReport; rows: TypeRow[] }> {
    const { filter, from, to } = this.filter(q, true);
    const docs = await this.model
      .find(filter)
      .select({ formNo: 1, airport: 1, originator: 1, status: 1, createdAt: 1, versions: { $slice: -1 } })
      .lean();
    return computeTypes(docs as unknown as TypeDoc[], { from, to, airport: q.airport, status: q.status });
  }
}

const READERS = ['ADMIN', 'NOF', 'PIA', 'ATS'] as const;
const stamp = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');

// Executive analytics dan laporan jenis: hanya role non-Originator. Ekspor tercatat di audit log.
@Controller('analytics')
export class AnalyticsController {
  constructor(private svc: AnalyticsService, private audit: AuditService) {}

  private rec(u: AuthUser, what: string, kind: string, q: TypesQuery) {
    return this.audit.record({ actor: u.username, role: u.role, action: 'REQUEST_EXPORT', target: 'analytics', summary: `Mengunduh ${what} (${kind})${q.airport ? ` bandara ${q.airport}` : ''}`, detail: { ...q } });
  }

  @Roles(...READERS) @Get()
  async get(@Query() q: AnalyticsQuery) {
    return (await this.svc.run(q)).analytics;
  }

  @Roles(...READERS) @Get('export.xlsx')
  async xlsx(@CurrentUser() u: AuthUser, @Query() q: AnalyticsQuery) {
    const { analytics, rows } = await this.svc.run(q);
    await this.rec(u, 'ringkasan eksekutif', 'Excel', q);
    return new StreamableFile(await analyticsToExcel(analytics, rows), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="notam-ringkasan-eksekutif-${stamp()}.xlsx"`,
    });
  }

  @Roles(...READERS) @Get('export.pptx')
  async pptx(@CurrentUser() u: AuthUser, @Query() q: AnalyticsQuery) {
    const { analytics } = await this.svc.run(q);
    await this.rec(u, 'ringkasan eksekutif', 'PowerPoint', q);
    return new StreamableFile(await analyticsToPptx(analytics), {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      disposition: `attachment; filename="notam-ringkasan-eksekutif-${stamp()}.pptx"`,
    });
  }

  // Rincian NOTAM di balik satu elemen grafik (klik pada analytics). Maksimal 300 baris.
  @Roles(...READERS) @Get('drill')
  async drill(@Query() q: AnalyticsQuery & { dim?: string; value?: string }) {
    const { rows } = await this.svc.run(q);
    const v = q.value ?? '';
    const by: Record<string, (r: Row) => boolean> = {
      status: (r) => r.status === v,
      airport: (r) => r.airport === v,
      qcode: (r) => r.qcode === v,
      fir: (r) => findAirport(r.airport)?.fir === v,
      originator: (r) => r.originator === v,
      validation: (r) => r.validation === v,
      stage: (r) => r.stageNow === v,
      period: (r) => new Date(r.createdAt).toISOString().startsWith(v),
      outcome: (r) => v === 'APPROVED_BY_NOF' ? r.status === v : v === 'REJECTED' ? r.status === v : !['APPROVED_BY_NOF', 'REJECTED'].includes(r.status),
    };
    const fn = by[q.dim ?? ''];
    if (!fn) throw new BadRequestException('Dimensi tidak dikenal');
    const match = rows.filter(fn).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    const e = (g: string) => /^E\)\s*([\s\S]*)$/m.exec(g)?.[1].replace(/\s+/g, ' ').trim().slice(0, 160) ?? '';
    return {
      total: match.length,
      items: match.slice(0, 300).map((r) => ({ id: r.formNo, formNo: r.formNo, createdAt: r.createdAt, airport: r.airport, status: r.status, qcode: r.qcode, text: e(r.generated), prompt: r.prompt, full: r.generated })),
    };
  }

  // ---- Laporan menurut jenis NOTAM (kode Q)
  @Roles(...READERS) @Get('types')
  async types(@Query() q: TypesQuery) {
    return (await this.svc.runTypes(q)).report;
  }

  // Rincian NOTAM untuk satu jenis (klik pada laporan). Maksimal 300 baris.
  @Roles(...READERS) @Get('types/list')
  async typeList(@Query() q: TypesQuery) {
    if (q.impact && !(IMPACTS as string[]).includes(q.impact)) throw new BadRequestException('Dampak tidak dikenal');
    const { rows } = await this.svc.runTypes(q);
    const match = rows.filter((r) => (!q.group || r.group === q.group) && (!q.subject || r.subject === q.subject) && (!q.condition || r.condition === q.condition) && (!q.impact || impactOf(r.condition) === q.impact));
    match.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    return { total: match.length, items: match.slice(0, 300) };
  }

  @Roles(...READERS) @Get('types/export.xlsx')
  async typesXlsx(@CurrentUser() u: AuthUser, @Query() q: TypesQuery) {
    const { report, rows } = await this.svc.runTypes(q);
    await this.rec(u, 'laporan jenis NOTAM', 'Excel', q);
    return new StreamableFile(await typesToExcel(report, rows), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="notam-laporan-jenis-${stamp()}.xlsx"`,
    });
  }

  @Roles(...READERS) @Get('types/export.pptx')
  async typesPptx(@CurrentUser() u: AuthUser, @Query() q: TypesQuery) {
    const { report } = await this.svc.runTypes(q);
    await this.rec(u, 'laporan jenis NOTAM', 'PowerPoint', q);
    return new StreamableFile(await typesToPptx(report), {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      disposition: `attachment; filename="notam-laporan-jenis-${stamp()}.pptx"`,
    });
  }
}
