import { ApiProperty } from '@nestjs/swagger';

import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum PayoutMethod {
  BANK_TRANSFER = 'bank_transfer',
  PAYPAL = 'paypal',
}

/**
 * Superadmin payout-approval body. Both fields are OPTIONAL: when the PayPal
 * gateway is configured, the payout is automated and `method`/`reference` are
 * derived from the gateway. They are only required for the MANUAL fallback
 * (gateway unconfigured) — the service enforces that.
 */
export class ProcessPayoutDto {
  @IsOptional()
  @IsEnum(PayoutMethod)
  @ApiProperty({ required: false, enum: PayoutMethod })
  method?: PayoutMethod;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ApiProperty({ required: false, example: 'txn-12345' })
  reference?: string;
}
