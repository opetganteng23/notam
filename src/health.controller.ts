import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { Public } from './auth/auth';

// Untuk pemantauan/NGINX: 200 bila database terhubung, 503 bila tidak.
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private db: Connection) {}

  @Public() @Get()
  check() {
    if (this.db.readyState !== 1) throw new ServiceUnavailableException({ status: 'down', db: 'terputus' });
    return { status: 'ok', db: 'terhubung', llm: process.env.LLM_PROVIDER ?? 'mock' };
  }
}
