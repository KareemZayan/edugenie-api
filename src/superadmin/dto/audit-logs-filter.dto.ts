import { ApiProperty } from '@nestjs/swagger';

import {
  IsDateString,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AuditLogsFilterDto {
  @IsOptional()
  @IsMongoId()
  @ApiProperty({ required: false, example: '507f1f77bcf86cd799439011' })
  userId?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false, example: 'string_example' })
  action?: string;

  @IsOptional()
  @IsDateString()
  @ApiProperty({ required: false, example: 'string_example' })
  startDate?: string;

  @IsOptional()
  @IsDateString()
  @ApiProperty({ required: false, example: 'string_example' })
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @ApiProperty({ required: false, example: 1 })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  @ApiProperty({ required: false, example: 1 })
  limit?: number;
}
