export type Role = 'ORIGINATOR' | 'ATS' | 'PIA' | 'NOF' | 'ADMIN';
export type Status =
  | 'DRAFT'
  | 'UNDER_ATS'
  | 'UNDER_PIA'
  | 'UNDER_NOF'
  | 'REVISION_REQUIRED'
  | 'REJECTED'
  | 'APPROVED_BY_NOF';
export type Action = 'SUBMIT' | 'ACCEPT' | 'REVISE' | 'REJECT';
export type Route = 'ATS' | 'PIA';

export const MAX_PIA_REVISIONS = 3;

export interface TransitionInput {
  status: Status;
  action: Action;
  role: Role;
  route?: Route;
  note?: string;
  piaRevisionCount: number;
}

export interface TransitionResult {
  next: Status;
  countsAsPiaRevision: boolean;
}

export class WorkflowError extends Error {}

const reviewerStage: Partial<Record<Status, Role>> = {
  UNDER_ATS: 'ATS',
  UNDER_PIA: 'PIA',
  UNDER_NOF: 'NOF',
};

export function transition(i: TransitionInput): TransitionResult {
  const { status, action, role } = i;

  if (action === 'SUBMIT') {
    if (role !== 'ORIGINATOR') throw new WorkflowError('Hanya Originator yang dapat submit');
    if (status !== 'DRAFT' && status !== 'REVISION_REQUIRED')
      throw new WorkflowError(`Tidak dapat submit dari status ${status}`);
    if (i.route !== 'ATS' && i.route !== 'PIA') throw new WorkflowError('Jalur submit (ATS/PIA) wajib dipilih');
    return { next: i.route === 'ATS' ? 'UNDER_ATS' : 'UNDER_PIA', countsAsPiaRevision: false };
  }

  const stageRole = reviewerStage[status];
  if (!stageRole) throw new WorkflowError(`Status ${status} tidak menerima aksi ${action}`);
  if (role !== stageRole) throw new WorkflowError(`Status ${status} hanya dapat diproses oleh ${stageRole}`);

  if ((action === 'REVISE' || action === 'REJECT') && !i.note?.trim())
    throw new WorkflowError('Catatan wajib untuk Revisi/Rejected');

  if (action === 'ACCEPT') {
    const next: Status = status === 'UNDER_ATS' ? 'UNDER_PIA' : status === 'UNDER_PIA' ? 'UNDER_NOF' : 'APPROVED_BY_NOF';
    return { next, countsAsPiaRevision: false };
  }

  if (action === 'REVISE') {
    // Asumsi: NOF yang menolak/merevisi mengembalikan ke PIA (MoM: "Approve/Rejected to PIA").
    if (status === 'UNDER_NOF') return { next: 'UNDER_PIA', countsAsPiaRevision: false };
    if (status === 'UNDER_PIA' && i.piaRevisionCount >= MAX_PIA_REVISIONS)
      throw new WorkflowError(`Batas revisi PIA (${MAX_PIA_REVISIONS}x) tercapai; gunakan Accept atau Reject`);
    return { next: 'REVISION_REQUIRED', countsAsPiaRevision: status === 'UNDER_PIA' };
  }

  // REJECT
  if (status === 'UNDER_NOF') return { next: 'UNDER_PIA', countsAsPiaRevision: false };
  return { next: 'REJECTED', countsAsPiaRevision: false };
}
