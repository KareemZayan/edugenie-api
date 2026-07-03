export enum PayoutRequestStatus {
  // Instructor asked to be paid; awaiting superadmin decision.
  PENDING = 'PENDING',
  // Superadmin confirmed and paid; the covered earnings are PAID_OUT.
  APPROVED = 'APPROVED',
  // Superadmin declined; the covered earnings return to PENDING.
  REJECTED = 'REJECTED',
}
