import { ApiProperty } from '@nestjs/swagger';

import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export enum PayoutMethod {
  BANK_TRANSFER = 'bank_transfer',
  PAYPAL = 'paypal',
}

export class ProcessPayoutDto {
  @IsEnum(PayoutMethod)
  @ApiProperty()
  method!: PayoutMethod;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @ApiProperty({ example: 'string_example' })
  reference!: string;
}
