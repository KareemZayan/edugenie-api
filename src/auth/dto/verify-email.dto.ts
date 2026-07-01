import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEmail } from 'class-validator';

export class VerifyEmailDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The raw token from the verification email link',
  })
  token: string;
}

export class ResendVerificationDto {
  @IsEmail()
  @ApiProperty({ example: 'student@example.com' })
  email: string;
}
