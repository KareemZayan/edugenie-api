import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectPayoutDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  @ApiProperty({ example: 'Missing payout details — please update your bank info.' })
  reason!: string;
}
