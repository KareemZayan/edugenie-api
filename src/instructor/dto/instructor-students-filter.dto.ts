import { IsOptional, IsEnum, IsNumber, Min, Max, IsMongoId } from 'class-validator';
import { Type } from 'class-transformer';

export class InstructorStudentsFilterDto {
  @IsOptional()
  @IsMongoId()
  courseId?: string;

  @IsOptional()
  @IsEnum(['full_course', 'sections'])
  accessType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}
