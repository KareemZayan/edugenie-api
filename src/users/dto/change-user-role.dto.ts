import { ApiProperty } from '@nestjs/swagger';

import { IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { UserRole } from '../../common/enums/user-role.enum';

export class ChangeUserRoleDto {
  @IsEnum(UserRole)
  @ApiProperty({ enum: UserRole, enumName: 'UserRole', example: 'student' })
  newRole: UserRole;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({ required: false, example: true })
  confirmSuperAdminChange?: boolean;
}
