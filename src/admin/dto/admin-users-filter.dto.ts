import { ApiProperty } from '@nestjs/swagger';

import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginateQueryDto } from '../../common/dto/paginate-query.dto';
import { UserRole } from '../../common/enums/user-role.enum';
import { UserStatus } from '../../common/enums/user-status.enum';

export class AdminUsersFilterDto extends PaginateQueryDto {
  @IsOptional()
  @IsEnum([UserRole.STUDENT, UserRole.INSTRUCTOR])
  @ApiProperty({
    required: false,
    enum: UserRole,
    enumName: 'UserRole',
    example: 'student',
  })
  role?: UserRole;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ApiProperty({ required: false, example: 'string_example' })
  search?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  @ApiProperty({ required: false })
  status?: UserStatus;
}
