import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAdminInviteDto {
  @IsString()
  @MinLength(2, { message: 'First name must be at least 2 characters long' })
  @MaxLength(30)
  firstName!: string;

  @IsString()
  @MinLength(2, { message: 'Last name must be at least 2 characters long' })
  @MaxLength(30)
  lastName!: string;

  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;
}
