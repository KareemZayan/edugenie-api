import {
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CheckoutDto {
  @ApiProperty({ description: 'Course to buy (full course, test mode).' })
  @IsNotEmpty()
  @IsMongoId()
  courseId!: string;

  @ApiProperty({
    required: false,
    enum: ['dashboard', 'student'],
    description:
      'Which app initiated the purchase — decides where Stripe redirects back.',
  })
  @IsOptional()
  @IsIn(['dashboard', 'student'])
  origin?: 'dashboard' | 'student';
}

export class ConfirmCheckoutDto {
  @ApiProperty({ description: 'The Stripe Checkout Session id to confirm.' })
  @IsNotEmpty()
  @IsString()
  sessionId!: string;
}

export class CartCheckoutDto {
  @ApiProperty({
    required: false,
    enum: ['dashboard', 'student'],
    description:
      'Which app initiated the purchase — decides where Stripe redirects back.',
  })
  @IsOptional()
  @IsIn(['dashboard', 'student'])
  origin?: 'dashboard' | 'student';
}
