import { ApiProperty } from '@nestjs/swagger';

import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdatePlatformConfigDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @ApiProperty({ required: false, example: 1 })
  platformFeePercent?: number;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({ required: false, example: true })
  maintenanceMode?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @ApiProperty({ required: false, example: 1 })
  minimumPayoutThreshold?: number;
}
