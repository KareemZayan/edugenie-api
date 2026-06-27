import { ApiProperty } from '@nestjs/swagger';

import { IsOptional, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class PaginateQueryDto {
  @IsOptional()
  @Type(() => Number) // ← add this
  @IsNumber()
  @Min(1)
  @ApiProperty({ required: false, example: 1 })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number) // ← add this
  @IsNumber()
  @Min(1)
  @Max(100)
  @ApiProperty({ required: false, example: 1 })
  limit?: number = 10;
}
