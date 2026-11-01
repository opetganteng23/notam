import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function main() {
  const jwtSecret = process.env.JWT_SECRET;
  const mongoUri = process.env.MONGO_URI;
  if (!jwtSecret || !mongoUri) throw new Error('MONGO_URI dan JWT_SECRET wajib diset');
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register({ mongoUri, jwtSecret }));
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  app.use((_req: any, res: any, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  // Frontend hasil build (frontend/ -> backend/public) disajikan dari proses yang sama.
  const publicDir = join(__dirname, '..', 'public');
  app.useStaticAssets(publicDir);
  app.use((req: any, res: any, next: () => void) =>
    req.method === 'GET' && !req.path.startsWith('/api') ? res.sendFile(join(publicDir, 'index.html')) : next(),
  );

  // HOST membatasi antarmuka (mis. IP Tailscale/WireGuard) agar backend tidak terbuka ke jaringan lain.
  await app.listen(process.env.PORT ?? 3000, process.env.HOST ?? '0.0.0.0');
}
main();
