import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export enum PayoutMethod {
  BANK_TRANSFER = 'bank_transfer',
  PAYPAL = 'paypal',
}

export class ProcessPayoutDto {
  @IsEnum(PayoutMethod)
  method!: PayoutMethod;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  reference!: string;
}
