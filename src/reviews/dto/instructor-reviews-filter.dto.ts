import { ApiProperty } from '@nestjs/swagger';

import {
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsMongoId,
  IsArray,
  IsEnum,
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
  @ApiProperty({ required: false, example: '507f1f77bcf86cd799439011', description: 'Filter by specific course' })
  courseId?: string;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  @Type(() => Number)
  @Transform(({ value }) =>
    Array.isArray(value) ? value : value.split(',').map(Number),
  )
  @ApiProperty({ required: false, example: '1,2,3', description: 'Filter by rating (1-5), comma-separated' })
  rating?: number[];

  @IsOptional()
  @IsEnum(ReviewSortBy)
  @ApiProperty({ required: false, enum: ReviewSortBy, description: 'Sort order' })
  sortBy?: ReviewSortBy;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @ApiProperty({ required: false, example: 1, description: 'Page number for pagination' })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  @ApiProperty({ required: false, example: 10, description: 'Items per page' })
  limit?: number;
}

