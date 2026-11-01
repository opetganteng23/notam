// Gerbang layanan generate: admin dapat menjeda, membatasi jam layanan, dan kuota harian per pengguna.
export interface Gate {
  enabled: boolean;
  message: string;
  dailyLimit: number; // 0 = tanpa batas
  window: string; // '' atau 'HH:MM-HH:MM' (jam server; boleh melewati tengah malam)
}

export const DEFAULT_GATE: Gate = { enabled: true, message: '', dailyLimit: 0, window: '' };

const WINDOW = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/;

// Mengembalikan Gate yang valid atau melempar Error berisi pesan untuk admin.
export function parseGate(b: Partial<Gate>): Gate {
  const window = typeof b.window === 'string' ? b.window.trim() : '';
  const m = window ? WINDOW.exec(window) : null;
  if (window && !m) throw new Error('Jam layanan harus berformat HH:MM-HH:MM, mis. 08:00-17:00');
  if (m && m[1] + m[2] === m[3] + m[4]) throw new Error('Jam mulai dan selesai tidak boleh sama');
  const dailyLimit = Number(b.dailyLimit ?? 0);
  if (!Number.isInteger(dailyLimit) || dailyLimit < 0 || dailyLimit > 1000) throw new Error('Batas harian harus bilangan bulat 0-1000 (0 = tanpa batas)');
  const message = typeof b.message === 'string' ? b.message.trim() : '';
  if (message.length > 200) throw new Error('Pesan maksimal 200 karakter');
  return { enabled: b.enabled !== false, message, dailyLimit, window };
}

export function gateStatus(g: Gate, now = new Date()): { open: boolean; reason: string } {
  if (!g.enabled) return { open: false, reason: g.message || 'Generate sedang dijeda oleh admin' };
  const m = WINDOW.exec(g.window);
  if (m) {
    const start = +m[1] * 60 + +m[2];
    const end = +m[3] * 60 + +m[4];
    const cur = now.getHours() * 60 + now.getMinutes();
    const inside = start < end ? cur >= start && cur < end : cur >= start || cur < end;
    if (!inside) return { open: false, reason: g.message || `Generate hanya tersedia pada ${g.window}` };
  }
  return { open: true, reason: '' };
}
