import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

/** Set/replace the instructor's PayPal payout email. */
export class SetPayoutMethodDto {
  @IsNotEmpty()
  @IsEmail()
  @ApiProperty({ example: 'instructor@example.com' })
  paypalEmail!: string;
}
