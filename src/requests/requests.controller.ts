import { BadRequestException, Body, Controller, Get, Param, Post, Put, Query, StreamableFile } from '@nestjs/common';
import { AuthUser, CurrentUser, Roles } from '../auth/auth';
import { Action } from '../workflow/workflow';
import { toExcel, toPdf } from './export';
import { ListQuery, RequestsService } from './requests.service';

@Controller('requests')
export class RequestsController {
  constructor(private svc: RequestsService) {}

  @Roles('ORIGINATOR') @Post()
  create(@CurrentUser() u: AuthUser, @Body() b: { airport?: string; freeText: string; reuseOf?: string }) {
    return this.svc.create(u, b.airport, b.freeText, b.reuseOf);
  }

  @Roles('ORIGINATOR') @Put(':id/text')
  revise(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: { freeText: string }) {
    return this.svc.revise(u, id, b.freeText);
  }

  @Roles('ORIGINATOR') @Post(':id/submit')
  submit(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: { route: 'ATS' | 'PIA' }) {
    return this.svc.act(u, id, 'SUBMIT', { route: b.route });
  }

  @Roles('ATS', 'PIA', 'NOF') @Post(':id/decision')
  decide(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: { action: Action; note?: string }) {
    if (!['ACCEPT', 'REVISE', 'REJECT'].includes(b.action)) throw new BadRequestException('action harus ACCEPT/REVISE/REJECT');
    return this.svc.act(u, id, b.action, { note: b.note });
  }

  @Get()
  list(@CurrentUser() u: AuthUser, @Query() q: ListQuery) {
    return this.svc.list(u, q);
  }

  // Harus sebelum ':id'.
  @Get('stats')
  stats(@CurrentUser() u: AuthUser) {
    return this.svc.stats(u);
  }

  // Excel untuk ATS/PIA/NOF (sesuai MoM) dan admin.
  @Roles('ATS', 'PIA', 'NOF', 'ADMIN') @Get('export.xlsx')
  async exportXlsx(@CurrentUser() u: AuthUser, @Query() q: ListQuery) {
    return new StreamableFile(await toExcel(await this.svc.list(u, q)), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="notam.xlsx"',
    });
  }

  @Get(':id/pdf')
  async pdf(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const r = await this.svc.get(u, id);
    return new StreamableFile(await toPdf(r), { type: 'application/pdf', disposition: `attachment; filename="${r.formNo}.pdf"` });
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.get(u, id);
  }
}
