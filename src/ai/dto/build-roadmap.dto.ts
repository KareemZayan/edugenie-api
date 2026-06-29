import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class BuildRoadmapDto {
  @IsString()
  @MaxLength(300)
  goal: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  level?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  time?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timeline?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  focus?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
