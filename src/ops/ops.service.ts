import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import * as os from 'os';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth';
import { NotamRequest, Setting } from '../requests/schemas';
import { DEFAULT_GATE, Gate, gateStatus, parseGate } from './gate';

const MAX_QUEUE = 10;
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// Mengendalikan pemakaian LLM di server on-prem: gerbang (jeda/jam/kuota), antrean, dan pemantauan.
@Injectable()
export class OpsService {
  private log = new Logger(OpsService.name);
  private failures = 0;
  private running = 0;
  private waiting: (() => void)[] = [];
  private max = Math.max(1, Number(process.env.LLM_CONCURRENCY ?? 2));

  constructor(
    @InjectModel(Setting.name) private settings: Model<Setting>,
    @InjectModel(NotamRequest.name) private requests: Model<NotamRequest>,
    @InjectConnection() private db: Connection,
    private audit: AuditService,
  ) {}

  async getGate(): Promise<Gate> {
    const s = await this.settings.findOne({ key: 'gate' }).lean();
    return { ...DEFAULT_GATE, ...(s?.value as Partial<Gate> | undefined) };
  }

  async setGate(patch: Partial<Gate>, by: AuthUser): Promise<Gate> {
    const prev = await this.getGate();
    let g: Gate;
    try {
      g = parseGate({ ...prev, ...patch });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    await this.settings.updateOne({ key: 'gate' }, { $set: { value: g } }, { upsert: true });
    const diff = (Object.keys(g) as (keyof Gate)[]).filter((k) => g[k] !== prev[k]);
    if (diff.length)
      await this.audit.record({
        actor: by.username, role: by.role, action: 'SERVER_GATE', target: 'gate',
        summary: `Mengubah pengaturan generate: ${diff.map((k) => `${k} ${JSON.stringify(prev[k])} → ${JSON.stringify(g[k])}`).join(', ')}`,
        detail: Object.fromEntries(diff.map((k) => [k, { from: prev[k], to: g[k] }])),
      });
    // Jeda membongkar model agar GPU turun ke siaga; buka memuatnya lagi di latar belakang (permintaan pertama tidak lambat).
    if (prev.enabled !== g.enabled && this.llmConf().provider === 'ollama')
      this.llmLoad(!g.enabled).catch((e) => this.log.warn(`Model tidak dapat ${g.enabled ? 'dimuat' : 'dibongkar'}: ${e.message}`));
    return g;
  }

  // Untuk semua pengguna login: apakah generate sedang dibuka.
  async publicGate() {
    const g = await this.getGate();
    return { ...gateStatus(g), dailyLimit: g.dailyLimit };
  }

  private async usedToday(username: string) {
    const [r] = await this.requests.aggregate([
      { $match: { originator: username } },
      { $unwind: '$versions' },
      { $match: { 'versions.createdAt': { $gte: startOfToday() } } },
      { $count: 'n' },
    ]);
    return r?.n ?? 0;
  }

  private async acquire() {
    if (this.running < this.max) return void this.running++;
    if (this.waiting.length >= MAX_QUEUE) throw new HttpException('Server sedang sibuk, coba lagi sebentar lagi', HttpStatus.TOO_MANY_REQUESTS);
    await new Promise<void>((r) => this.waiting.push(r)); // slot diserahkan oleh release()
  }

  private release() {
    const next = this.waiting.shift();
    if (next) next();
    else this.running--;
  }

  // Semua pemanggilan LLM melewati sini: gerbang, kuota harian, antrean, pengukuran waktu.
  async guarded<T>(user: AuthUser, fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
    const g = await this.getGate();
    const st = gateStatus(g);
    if (!st.open) throw new ServiceUnavailableException(st.reason);
    if (g.dailyLimit > 0 && (await this.usedToday(user.username)) >= g.dailyLimit)
      throw new HttpException(`Batas generate harian (${g.dailyLimit}) sudah tercapai`, HttpStatus.TOO_MANY_REQUESTS);
    await this.acquire();
    const t = Date.now();
    try {
      return { result: await fn(), ms: Date.now() - t };
    } catch (e) {
      this.failures++;
      throw e;
    } finally {
      this.release();
    }
  }

  private llmConf() {
    return { provider: process.env.LLM_PROVIDER ?? 'mock', model: process.env.LLM_MODEL ?? '', url: process.env.OLLAMA_URL ?? 'http://localhost:11434' };
  }

  private async llmInfo() {
    const c = this.llmConf();
    if (c.provider !== 'ollama') return { provider: c.provider, model: c.model, reachable: null, latencyMs: null, loaded: [] as unknown[] };
    const t = Date.now();
    try {
      const r = await fetch(`${c.url}/api/ps`, { signal: AbortSignal.timeout(2500) });
      const j: any = await r.json().catch(() => ({}));
      const loaded = (j.models ?? []).map((m: any) => ({ name: m.name, sizeMB: Math.round((m.size_vram ?? m.size ?? 0) / 1048576), expires: m.expires_at }));
      return { provider: c.provider, model: c.model, reachable: r.ok, latencyMs: Date.now() - t, loaded };
    } catch {
      return { provider: c.provider, model: c.model, reachable: false, latencyMs: null, loaded: [] as unknown[] };
    }
  }

  // Memuat model ke memori (keep_alive default) atau membongkarnya (0) untuk membebaskan VRAM/RAM.
  async llmLoad(unload: boolean) {
    const c = this.llmConf();
    if (c.provider !== 'ollama') throw new BadRequestException('Hanya untuk LLM_PROVIDER=ollama');
    try {
      const r = await fetch(`${c.url}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: c.model, prompt: '', stream: false, keep_alive: unload ? 0 : process.env.OLLAMA_KEEP_ALIVE ?? '10m' }),
        signal: AbortSignal.timeout(180_000),
      });
      if (!r.ok) throw new Error(`Ollama ${r.status}`);
    } catch (e) {
      throw new ServiceUnavailableException(`Ollama tidak dapat dihubungi: ${(e as Error).message}`);
    }
    return this.llmInfo();
  }

  async status() {
    const [gate, llm, today] = await Promise.all([
      this.getGate(),
      this.llmInfo(),
      this.requests.aggregate([
        { $unwind: '$versions' },
        { $match: { 'versions.createdAt': { $gte: startOfToday() } } },
        { $group: { _id: '$originator', n: { $sum: 1 }, avgMs: { $avg: '$versions.ms' } } },
        { $sort: { n: -1, _id: 1 } },
      ]),
    ]);
    const timed = today.filter((t) => t.avgMs != null);
    const timedN = timed.reduce((a, t) => a + t.n, 0);
    return {
      server: {
        host: os.hostname(),
        uptimeSec: Math.round(process.uptime()),
        cpus: os.cpus().length,
        freeMemMB: Math.round(os.freemem() / 1048576),
        totalMemMB: Math.round(os.totalmem() / 1048576),
        appMemMB: Math.round(process.memoryUsage().rss / 1048576),
        db: this.db.readyState === 1,
      },
      gate,
      gateStatus: gateStatus(gate),
      llm,
      usage: {
        today: today.map((t) => ({ user: t._id, n: t.n })),
        avgMs: timedN ? Math.round(timed.reduce((a, t) => a + t.avgMs * t.n, 0) / timedN) : null,
        failuresSinceStart: this.failures,
        running: this.running,
        queued: this.waiting.length,
        maxConcurrent: this.max,
      },
    };
  }
}
