import { ApiProperty } from '@nestjs/swagger';

import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  MinLength,
  MaxLength,
  IsUrl,
} from 'class-validator';
import { UserLevel } from '../../common/enums/user-level.enum';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'First name must be at least 2 characters long' })
  @MaxLength(30)
  @ApiProperty({ required: false, example: 'string_example' })
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Last name must be at least 2 characters long' })
  @MaxLength(30)
  @ApiProperty({ required: false, example: 'string_example' })
  lastName?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Avatar must be a valid URL' })
  @ApiProperty({ required: false, example: 'string_example' })
  avatar?: string | null;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false, example: '507f1f77bcf86cd799439011' })
  avatarPublicId?: string | null;

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
