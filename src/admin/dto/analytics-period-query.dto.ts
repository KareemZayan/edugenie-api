import { ApiProperty } from '@nestjs/swagger';

import { IsEnum, IsOptional } from 'class-validator';

export enum AnalyticsPeriod {
  SEVEN_DAYS = '7d',
  THIRTY_DAYS = '30d',
  NINETY_DAYS = '90d',
  ONE_YEAR = '1y',
  ALL = 'all',
}

export class AnalyticsPeriodQueryDto {
  @IsOptional()
  @IsEnum(AnalyticsPeriod)
  @ApiProperty({ required: false })
  period?: AnalyticsPeriod = AnalyticsPeriod.THIRTY_DAYS;
}
