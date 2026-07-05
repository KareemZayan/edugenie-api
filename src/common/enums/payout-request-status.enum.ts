export enum PayoutRequestStatus {
  // Instructor asked to be paid; awaiting superadmin decision.
  PENDING = 'PENDING',
  // Superadmin approved; a gateway payout (PayPal) is in flight (async). The
  // covered earnings stay REQUESTED until the gateway webhook confirms success.
  PROCESSING = 'PROCESSING',
  // Superadmin confirmed and paid; the covered earnings are PAID_OUT.
  APPROVED = 'APPROVED',
  // Superadmin declined; the covered earnings return to PENDING.
  REJECTED = 'REJECTED',
  // Gateway payout was rejected/returned; the covered earnings stay REQUESTED so
  // the superadmin can retry (they are not lost).
  FAILED = 'FAILED',
}
