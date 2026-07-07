import { ApiProperty } from '@nestjs/swagger';

import {
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsMongoId,
  IsArray,
  IsEnum,
  IsString,
  IsBoolean,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export enum ReviewSortBy {
  NEWEST = 'newest',
  OLDEST = 'oldest',
  RATING_HIGH = 'rating_high',
  RATING_LOW = 'rating_low',
}

export class InstructorReviewsFilterDto {
  @IsOptional()
  @IsMongoId()
  @ApiProperty({ required: false })
  courseId?: string;

  @IsOptional()
@IsArray()
@IsNumber({}, { each: true })
@Transform(({ value }) =>
  Array.isArray(value) ? value.map(Number) : String(value).split(',').map(Number),
)
@ApiProperty({ required: false, example: '1,2,3', description: 'Filter by rating (1-5), comma-separated' })
rating?: number[];

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false, description: 'Search within comment text' })
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @ApiProperty({ required: false, description: 'Return only flagged reviews' })
  flaggedOnly?: boolean;

  @IsOptional()
  @IsEnum(ReviewSortBy)
  @ApiProperty({ required: false, enum: ReviewSortBy })
  sortBy?: ReviewSortBy;

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
  @ApiProperty({ required: false, example: 10 })
  limit?: number;
}

