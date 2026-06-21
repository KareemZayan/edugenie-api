import { IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { UserRole } from '../../common/enums/user-role.enum';

export class ChangeUserRoleDto {
  @IsEnum(UserRole)
  newRole: UserRole;

  @IsOptional()
  @IsBoolean()
  confirmSuperAdminChange?: boolean;
}
