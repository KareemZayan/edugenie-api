import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'The raw token from the reset email link' })
  token: string;

  @IsString()
  @MinLength(6)
  @ApiProperty({ minLength: 6 })
  password: string;
}
