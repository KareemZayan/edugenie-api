import { IsString, MinLength } from 'class-validator';

export class AcceptInviteDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password!: string;
}

export class ValidateInviteDto {
  @IsString()
  token!: string;
}
