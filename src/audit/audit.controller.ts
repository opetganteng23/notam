import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import { Roles } from '../auth/auth';
import { AuditQuery, AuditService } from './audit.service';

// Hanya baca: jejak audit tidak dapat diubah lewat API.
@Controller('audit')
export class AuditController {
  constructor(private audit: AuditService) {}

  @Roles('ADMIN') @Get()
  list(@Query() q: AuditQuery) {
    return this.audit.list(q);
  }

  @Roles('ADMIN') @Get('export.csv')
  async export(@Query() q: AuditQuery) {
    return new StreamableFile(Buffer.from('﻿' + (await this.audit.csv(q)), 'utf8'), {
      type: 'text/csv; charset=utf-8',
      disposition: 'attachment; filename="audit-log.csv"',
    });
  }
}
