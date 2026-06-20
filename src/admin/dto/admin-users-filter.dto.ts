import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginateQueryDto } from '../../common/dto/paginate-query.dto';
import { UserRole } from '../../common/enums/user-role.enum';
import { UserStatus } from '../../common/enums/user-status.enum';

export class AdminUsersFilterDto extends PaginateQueryDto {
  @IsOptional()
  @IsEnum([UserRole.STUDENT, UserRole.INSTRUCTOR])
  role?: UserRole;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
