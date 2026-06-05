import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  MinLength,
  MaxLength,
  IsUrl,
} from 'class-validator';
import { UserLevel } from '../enums/user-level.enum';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'First name must be at least 2 characters long' })
  @MaxLength(30)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Last name must be at least 2 characters long' })
  @MaxLength(30)
  lastName?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Avatar must be a valid URL' })
  avatar?: string;

  @IsOptional()
  @IsEnum(UserLevel)
  level?: UserLevel;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Bio cannot exceed 500 characters' })
  bio?: string;
}
