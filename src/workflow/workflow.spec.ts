import { transition, WorkflowError, MAX_PIA_REVISIONS } from './workflow';

const base = { piaRevisionCount: 0 } as const;

describe('workflow', () => {
  it('submit via ATS lalu accept sampai approved', () => {
    expect(transition({ ...base, status: 'DRAFT', action: 'SUBMIT', role: 'ORIGINATOR', route: 'ATS' }).next).toBe('UNDER_ATS');
    expect(transition({ ...base, status: 'UNDER_ATS', action: 'ACCEPT', role: 'ATS' }).next).toBe('UNDER_PIA');
    expect(transition({ ...base, status: 'UNDER_PIA', action: 'ACCEPT', role: 'PIA' }).next).toBe('UNDER_NOF');
    expect(transition({ ...base, status: 'UNDER_NOF', action: 'ACCEPT', role: 'NOF' }).next).toBe('APPROVED_BY_NOF');
  });

  it('submit langsung ke PIA', () => {
    expect(transition({ ...base, status: 'DRAFT', action: 'SUBMIT', role: 'ORIGINATOR', route: 'PIA' }).next).toBe('UNDER_PIA');
  });

  it('submit wajib memilih jalur dan hanya Originator', () => {
    expect(() => transition({ ...base, status: 'DRAFT', action: 'SUBMIT', role: 'ORIGINATOR' })).toThrow(WorkflowError);
    expect(() => transition({ ...base, status: 'DRAFT', action: 'SUBMIT', role: 'ATS', route: 'ATS' })).toThrow(WorkflowError);
  });

  it('role yang salah tidak dapat memproses tahap', () => {
    expect(() => transition({ ...base, status: 'UNDER_ATS', action: 'ACCEPT', role: 'PIA' })).toThrow(WorkflowError);
    expect(() => transition({ ...base, status: 'UNDER_NOF', action: 'ACCEPT', role: 'ATS' })).toThrow(WorkflowError);
  });

  it('revisi/reject wajib catatan', () => {
    expect(() => transition({ ...base, status: 'UNDER_ATS', action: 'REVISE', role: 'ATS' })).toThrow(/Catatan/);
    expect(() => transition({ ...base, status: 'UNDER_ATS', action: 'REJECT', role: 'ATS', note: '  ' })).toThrow(/Catatan/);
    expect(transition({ ...base, status: 'UNDER_ATS', action: 'REJECT', role: 'ATS', note: 'salah' }).next).toBe('REJECTED');
  });

  it('revisi PIA dihitung dan dibatasi 3x', () => {
    const r = transition({ ...base, status: 'UNDER_PIA', action: 'REVISE', role: 'PIA', note: 'x' });
    expect(r).toEqual({ next: 'REVISION_REQUIRED', countsAsPiaRevision: true });
    expect(() =>
      transition({ status: 'UNDER_PIA', action: 'REVISE', role: 'PIA', note: 'x', piaRevisionCount: MAX_PIA_REVISIONS }),
    ).toThrow(/Batas revisi/);
    expect(transition({ status: 'UNDER_PIA', action: 'REJECT', role: 'PIA', note: 'x', piaRevisionCount: MAX_PIA_REVISIONS }).next).toBe('REJECTED');
  });

  it('revisi ATS tidak dihitung ke batas PIA', () => {
    expect(transition({ ...base, status: 'UNDER_ATS', action: 'REVISE', role: 'ATS', note: 'x' }).countsAsPiaRevision).toBe(false);
  });

  it('NOF reject/revise kembali ke PIA; Originator submit ulang setelah revisi', () => {
    expect(transition({ ...base, status: 'UNDER_NOF', action: 'REJECT', role: 'NOF', note: 'x' }).next).toBe('UNDER_PIA');
    expect(transition({ ...base, status: 'REVISION_REQUIRED', action: 'SUBMIT', role: 'ORIGINATOR', route: 'PIA' }).next).toBe('UNDER_PIA');
  });

  it('status final tidak menerima aksi', () => {
    expect(() => transition({ ...base, status: 'REJECTED', action: 'ACCEPT', role: 'PIA' })).toThrow(WorkflowError);
    expect(() => transition({ ...base, status: 'APPROVED_BY_NOF', action: 'SUBMIT', role: 'ORIGINATOR', route: 'PIA' })).toThrow(WorkflowError);
  });
});
