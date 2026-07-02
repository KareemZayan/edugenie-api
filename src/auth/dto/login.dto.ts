import { ApiProperty } from '@nestjs/swagger';

import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @IsEmail()
  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @IsString()
  @MinLength(6)
  @ApiProperty({ example: 'Password123!' })
  password!: string;

  /** Extends the refresh-token lifetime (30d instead of 7d). */
  @IsOptional()
  @IsBoolean()
  @ApiProperty({ example: false, required: false })
  rememberMe?: boolean;
}
