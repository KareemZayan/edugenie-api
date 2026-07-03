export enum EarningStatus {
  PENDING = 'PENDING',
  CLEARED = 'CLEARED',
  // Locked into an open payout request awaiting superadmin approval.
  REQUESTED = 'REQUESTED',
  PAID_OUT = 'PAID_OUT',
}
