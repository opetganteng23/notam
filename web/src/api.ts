export type Role = 'ORIGINATOR' | 'ATS' | 'PIA' | 'NOF' | 'ADMIN';

export interface Issue { code: string; level: 'error' | 'warning'; message: string }
export interface Version { no: number; ms?: number; freeText: string; generated: string; corrections?: string[]; provider: string; validation?: { status: string; issues: Issue[] } }
export interface EventLog { actor: string; role: string; action: string; from: string; to: string; note?: string; at: string }
export interface NotamRequest {
  _id: string; formNo: string; airport: string; originator: string; status: string; route?: string;
  piaRevisionCount: number; versions: Version[]; events: EventLog[]; createdAt: string;
}

export interface Me { username: string; name: string; role: Role; createdAt: string | null; lastLoginAt: string | null }
export interface UserRow { _id: string; username: string; name: string; role: Role; active: boolean; createdAt: string; lastLoginAt: string | null }
export interface AuditItem { _id: string; at: string; actor: string; role?: string; action: string; target?: string; summary: string; ip?: string }
export interface GateState { enabled: boolean; message: string; dailyLimit: number; window: string }
export interface OpsStatus {
  server: { host: string; uptimeSec: number; cpus: number; freeMemMB: number; totalMemMB: number; appMemMB: number; db: boolean };
  gate: GateState;
  gateStatus: { open: boolean; reason: string };
  llm: { provider: string; model: string; reachable: boolean | null; latencyMs: number | null; loaded: { name: string; sizeMB: number; expires?: string }[] };
  usage: { today: { user: string; n: number }[]; avgMs: number | null; failuresSinceStart: number; running: number; queued: number; maxConcurrent: number };
}
export interface Analytics {
  period: { from: string | null; to: string | null; generatedAt: string; airport: string | null };
  kpi: {
    total: number; approved: number; rejected: number; inReview: number; needsRevision: number;
    approvalRate: number | null; firstPassRate: number | null; avgTurnaroundH: number | null; medianTurnaroundH: number | null; avgRevisions: number | null;
    aiPassRate: number | null; correctedRate: number | null; regenRate: number | null; avgGenSec: number | null; pendingOver24h: number;
    submitted: number; revisedDocs: number; revisionRate: number | null; rejectionRate: number | null;
  };
  previous: { from: string; to: string; kpi: Analytics['kpi']; stages: Analytics['stages'] } | null;
  status: Record<string, number>;
  funnel: { label: string; n: number }[];
  granularity: 'day' | 'month';
  series: { period: string; submitted: number; approved: number }[];
  stages: { stage: string; n: number; avgH: number | null; medianH: number | null; maxH: number | null }[];
  pending: { stage: string; n: number; oldestH: number | null; over24h: number }[];
  returns: { role: string; revise: number; reject: number }[];
  airports: { airport: string; name: string; n: number; approved: number; rejected: number }[];
  fir: { fir: string; n: number }[];
  qcodes: { code: string; label: string; n: number }[];
  originators: { originator: string; n: number; approved: number; rejected: number; approvalRate: number | null }[];
  ai: { validation: Record<string, number>; providers: { provider: string; n: number }[] };
  insights: string[];
}
export interface Stats {
  total: number;
  byStatus: Record<string, number>;
  byAirport: { airport: string; n: number }[];
  byMonth: { month: string; n: number }[];
  recent: { formNo: string; airport: string; actor: string; role: string; action: string; to: string; at: string }[];
}

import { flash, toast } from './toast';
import { fmtMs } from './util';

let token = sessionStorage.getItem('token') ?? '';

export const session = {
  get role(): Role | null {
    try { return JSON.parse(atob(token.split('.')[1])).role; } catch { return null; }
  },
  get user(): string {
    try { return JSON.parse(atob(token.split('.')[1])).username; } catch { return ''; }
  },
  set(t: string) { token = t; t ? sessionStorage.setItem('token', t) : sessionStorage.removeItem('token'); },
};

// Backend berjalan di PC on-prem; bila mati/putus, NGINX membalas 502/504 atau koneksi gagal.
const OFFLINE = 'Server on-prem tidak dapat dihubungi. Pastikan PC menyala dan terhubung, lalu coba lagi.';
const reach = async (url: string, init: RequestInit) => {
  let res: Response;
  try { res = await fetch(url, init); } catch { toast.error('Server tidak terjangkau', OFFLINE); throw new Error(OFFLINE); }
  if ([502, 504].includes(res.status)) { toast.error('Server tidak terjangkau', OFFLINE); throw new Error(OFFLINE); }
  return res;
};

export async function download(path: string, filename: string) {
  const res = await reach('/api' + path, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { toast.error('Unduhan gagal', `Server menjawab ${res.status}.`); throw new Error(`Unduh gagal (${res.status})`); }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await res.blob());
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  toast.success('Unduhan dimulai', filename);
}

const STATUS_ID: Record<string, string> = {
  DRAFT: 'Draft', UNDER_ATS: 'Review ATS', UNDER_PIA: 'Review PIA', UNDER_NOF: 'Review NOF',
  REVISION_REQUIRED: 'Perlu revisi', REJECTED: 'Ditolak', APPROVED_BY_NOF: 'Disetujui NOF',
};

// Pemberitahuan sukses untuk setiap aksi yang mengubah data. GET tidak memberi pemberitahuan.
function describe(method: string, path: string, body: any, res: any): [string, string?] | null {
  if (method === 'GET') return null;
  if (path === '/auth/login') return ['Berhasil masuk', `Selamat datang, ${body?.username}.`];
  if (method === 'POST' && path === '/requests') return ['NOTAM berhasil dibuat', `Nomor form ${res?.formNo ?? ''}${res?.versions?.[0]?.ms !== undefined ? `, disusun dalam ${fmtMs(res.versions[0].ms)}` : ''}. Periksa drafnya sebelum submit.`];
  if (/^\/requests\/[^/]+\/text$/.test(path)) return ['Teks diperbarui', `NOTAM disusun ulang (versi ${res?.versions?.length ?? '?'})${res?.versions?.at(-1)?.ms !== undefined ? ` dalam ${fmtMs(res.versions.at(-1).ms)}` : ''}.`];
  if (/^\/requests\/[^/]+\/submit$/.test(path)) return ['Pengajuan dikirim', `Diteruskan ke ${body?.route}. Status: ${STATUS_ID[res?.status] ?? res?.status}.`];
  if (/^\/requests\/[^/]+\/decision$/.test(path)) {
    const t = { ACCEPT: 'Accept dicatat', REVISE: 'Dikembalikan untuk revisi', REJECT: 'Reject dicatat' }[body?.action as 'ACCEPT'] ?? 'Keputusan dicatat';
    return [t, `Status sekarang: ${STATUS_ID[res?.status] ?? res?.status}.`];
  }
  if (method === 'POST' && path === '/users') return ['Pengguna dibuat', `${res?.username} (${res?.role}).`];
  if (method === 'PATCH' && /^\/users\//.test(path)) {
    const parts: string[] = [];
    if (body?.role) parts.push(`role menjadi ${body.role}`);
    if (body?.active !== undefined) parts.push(body.active ? 'akun diaktifkan' : 'akun dinonaktifkan');
    if (body?.password) parts.push('password direset');
    if (body?.name !== undefined) parts.push('nama diubah');
    return ['Perubahan disimpan', `${res?.username}: ${parts.join(', ')}.`];
  }
  if (method === 'DELETE' && /^\/users\//.test(path)) return ['Pengguna dihapus', 'Akun dihapus permanen. NOTAM yang pernah dibuatnya tetap tersimpan.'];
  if (method === 'PUT' && path === '/ops/gate') return ['Pengaturan generate disimpan', res?.enabled === false ? 'Generate sedang dijeda.' : 'Generate dibuka.'];
  if (path === '/ops/llm/warmup') return ['Model dimuat', 'Model siap menerima permintaan.'];
  if (path === '/ops/llm/unload') return ['Model dibongkar', 'GPU dibebaskan.'];
  return null;
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await reach('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) { flash('info', 'Sesi berakhir', 'Silakan masuk kembali.'); session.set(''); location.reload(); }
    const message = Array.isArray(data.message) ? data.message.join(', ') : data.message ?? `Error ${res.status}`;
    if (method !== 'GET') toast.error('Gagal', message);
    throw new Error(message);
  }
  const note = describe(method, path, body, data);
  if (note) toast.success(note[0], note[1]);
  return data as T;
}

export interface TypesReport {
  period: { from: string | null; to: string | null; generatedAt: string; airport: string | null; status: string | null };
  total: number; coded: number; uncoded: number;
  groups: { group: string; name: string; n: number; share: number; approved: number; rejected: number; subjects: { code: string; label: string | null; n: number; conditions: { code: string; label: string | null; n: number }[] }[] }[];
  conditions: { code: string; label: string | null; n: number; share: number }[];
  granularity: 'day' | 'month';
  trend: { keys: string[]; series: { period: string; counts: Record<string, number> }[] };
  matrix: { groups: string[]; rows: { airport: string; name: string; counts: Record<string, number>; total: number }[] };
  insights: string[];
}
export interface TypeItem { id: string; formNo: string; createdAt: string; airport: string; originator: string; status: string; qcode: string; group: string; subject: string; condition: string; text: string; prompt: string; full: string }
