import { ApiProperty } from '@nestjs/swagger';

import { IsOptional, IsEnum, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { CourseStatus } from '../../common/enums/course-status.enum';

export class InstructorCoursesFilterDto {
  @IsOptional()
  @IsEnum(CourseStatus)
  @ApiProperty({ required: false })
  status?: CourseStatus;

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
