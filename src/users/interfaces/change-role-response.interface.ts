export interface ChangeRoleResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  oldRole: string;
  newRole: string;
  changedAt: Date;
  changedBy: string;
}
