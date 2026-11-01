import { DEFAULT_GATE, gateStatus, parseGate } from './gate';

const at = (h: number, m = 0) => new Date(2025, 0, 1, h, m);

describe('gerbang generate', () => {
  it('terbuka secara bawaan', () => {
    expect(gateStatus(DEFAULT_GATE, at(3))).toEqual({ open: true, reason: '' });
  });

  it('jeda manual memakai pesan admin atau pesan bawaan', () => {
    expect(gateStatus({ ...DEFAULT_GATE, enabled: false }).reason).toMatch(/dijeda/);
    expect(gateStatus({ ...DEFAULT_GATE, enabled: false, message: 'Maintenance GPU' })).toEqual({ open: false, reason: 'Maintenance GPU' });
  });

  it('jam layanan biasa: batas awal termasuk, batas akhir tidak', () => {
    const g = { ...DEFAULT_GATE, window: '08:00-17:00' };
    expect(gateStatus(g, at(7, 59)).open).toBe(false);
    expect(gateStatus(g, at(8, 0)).open).toBe(true);
    expect(gateStatus(g, at(16, 59)).open).toBe(true);
    expect(gateStatus(g, at(17, 0)).open).toBe(false);
    expect(gateStatus(g, at(17, 0)).reason).toContain('08:00-17:00');
  });

  it('jam layanan melewati tengah malam', () => {
    const g = { ...DEFAULT_GATE, window: '22:00-06:00' };
    expect(gateStatus(g, at(23)).open).toBe(true);
    expect(gateStatus(g, at(5, 59)).open).toBe(true);
    expect(gateStatus(g, at(12)).open).toBe(false);
  });

  it('jeda manual menang atas jam layanan', () => {
    expect(gateStatus({ ...DEFAULT_GATE, enabled: false, window: '00:00-23:59' }, at(12)).open).toBe(false);
  });

  it('validasi input admin', () => {
    expect(() => parseGate({ window: '8:00-17:00' })).toThrow(/HH:MM-HH:MM/);
    expect(() => parseGate({ window: '25:00-17:00' })).toThrow(/HH:MM-HH:MM/);
    expect(() => parseGate({ window: '08:00-08:00' })).toThrow(/sama/);
    expect(() => parseGate({ dailyLimit: -1 })).toThrow(/Batas harian/);
    expect(() => parseGate({ dailyLimit: 1.5 })).toThrow(/Batas harian/);
    expect(() => parseGate({ dailyLimit: 5000 })).toThrow(/Batas harian/);
    expect(() => parseGate({ message: 'x'.repeat(201) })).toThrow(/200/);
    expect(parseGate({ window: ' 08:00-17:00 ', dailyLimit: 30, message: ' halo ' })).toEqual({ enabled: true, message: 'halo', dailyLimit: 30, window: '08:00-17:00' });
    expect(parseGate({ enabled: false }).enabled).toBe(false);
  });
});
