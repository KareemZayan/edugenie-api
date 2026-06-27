import { ApiProperty } from '@nestjs/swagger';

import {
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsMongoId,
  IsArray,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class InstructorReviewsFilterDto {
  @IsOptional()
  @IsMongoId()
  @ApiProperty({ required: false, example: '507f1f77bcf86cd799439011' })
  courseId?: string;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  @Type(() => Number)
  @Transform(({ value }) =>
    Array.isArray(value) ? value : value.split(',').map(Number),
  )
  @ApiProperty({ required: false, example: 1 })
  rating?: number[];

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
