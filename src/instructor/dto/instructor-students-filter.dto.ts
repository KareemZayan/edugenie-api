import { ApiProperty } from '@nestjs/swagger';

import {
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsMongoId,
} from 'class-validator';
import { Type } from 'class-transformer';

export class InstructorStudentsFilterDto {
  @IsOptional()
  @IsMongoId()
  @ApiProperty({ required: false, example: '507f1f77bcf86cd799439011' })
  courseId?: string;

  @IsOptional()
  @IsEnum(['full_course', 'sections'])
  @ApiProperty({ required: false, example: 'string_example' })
  accessType?: string;

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
