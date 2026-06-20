import { IsOptional, IsNumber, Min, Max, IsMongoId, IsArray } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class InstructorReviewsFilterDto {
  @IsOptional()
  @IsMongoId()
  courseId?: string;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  @Type(() => Number)
  @Transform(({ value }) => (Array.isArray(value) ? value : value.split(',').map(Number)))
  rating?: number[];

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
