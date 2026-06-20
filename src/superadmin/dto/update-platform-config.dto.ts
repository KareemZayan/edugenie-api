import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdatePlatformConfigDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  platformFeePercent?: number;

  @IsOptional()
  @IsBoolean()
  maintenanceMode?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumPayoutThreshold?: number;
}
