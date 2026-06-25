import { ApiProperty } from '@nestjs/swagger';

import {
  IsString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsArray,
  MinLength,
  MaxLength,
} from 'class-validator';

import { UserRole } from '../../common/enums/user-role.enum';
import { UserLevel } from '../../common/enums/user-level.enum';

export class CreateUserDto {
  @IsString()
  @MinLength(2, { message: 'First name must be at least 2 characters long' })
  @MaxLength(30)
  @ApiProperty({ example: 'string_example' })
  firstName!: string;

  @IsString()
  @MinLength(2, { message: 'Last name must be at least 2 characters long' })
  @MaxLength(30)
  @ApiProperty({ example: 'string_example' })
  lastName!: string;

  @IsEmail({}, { message: 'Please provide a valid email address' })
  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @ApiProperty({ example: 'Password123!' })
  password!: string;

  @IsEnum(UserRole, { message: 'Role must be student, instructor, or admin' })
  @ApiProperty({ enum: UserRole, enumName: 'UserRole', example: 'student' })
  role!: UserRole;

  // --- Optional Onboarding Fields below ---

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false, example: 'string_example' })
  avatar?: string;

  @IsOptional()
  @IsEnum(UserLevel)
  @ApiProperty({ required: false })
  level?: UserLevel;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ required: false, example: 'string_example' })
  skills?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ required: false, example: 'string_example' })
  interests?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Bio cannot exceed 500 characters' })
  @ApiProperty({ required: false, example: 'string_example' })
  bio?: string;
}
