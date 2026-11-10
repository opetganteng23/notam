import { Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';

export interface Mailer {
  send(to: string, subject: string, text: string): Promise<void>;
}
export const MAILER = 'MAILER';

// SMTP dari env (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM). Tanpa SMTP_HOST email tidak dikirim.
export function mailerFromEnv(): Mailer {
  const log = new Logger('Mailer');
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST) {
    return { send: async (to, subject) => log.warn(`SMTP_HOST belum diset; email "${subject}" untuk ${to} tidak dikirim`) };
  }
  const port = Number(SMTP_PORT ?? 587);
  const transport = createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined });
  return { send: async (to, subject, text) => void (await transport.sendMail({ from: SMTP_FROM ?? SMTP_USER, to, subject, text })) };
}
