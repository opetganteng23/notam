import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser, CurrentUser, Roles } from '../auth/auth';
import { Gate } from './gate';
import { OpsService } from './ops.service';

@Controller('ops')
export class OpsController {
  constructor(private ops: OpsService, private audit: AuditService) {}

  // Semua pengguna login: untuk menampilkan banner "generate dijeda".
  @Get('gate')
  publicGate() {
    return this.ops.publicGate();
  }

  @Roles('ADMIN') @Get('status')
  status() {
    return this.ops.status();
  }

  @Roles('ADMIN') @Put('gate')
  setGate(@CurrentUser() me: AuthUser, @Body() b: Partial<Gate>) {
    return this.ops.setGate(b, me);
  }

  @Roles('ADMIN') @Post('llm/warmup')
  async warmup(@CurrentUser() me: AuthUser) {
    const r = await this.ops.llmLoad(false);
    await this.audit.record({ actor: me.username, role: me.role, action: 'SERVER_LLM_WARMUP', target: 'llm', summary: 'Memuat model LLM (warm-up)' });
    return r;
  }

  @Roles('ADMIN') @Post('llm/unload')
  async unload(@CurrentUser() me: AuthUser) {
    const r = await this.ops.llmLoad(true);
    await this.audit.record({ actor: me.username, role: me.role, action: 'SERVER_LLM_UNLOAD', target: 'llm', summary: 'Membongkar model LLM' });
    return r;
  }
}
