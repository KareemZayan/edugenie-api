import { ApiProperty } from '@nestjs/swagger';

import {
  IsString,
  IsNumber,
  IsEnum,
  IsArray,
  IsMongoId,
  IsOptional,
  Min,
  MinLength,
  IsNotEmpty,
  IsUrl,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CourseLevel } from '../../common/enums/course-level.enum';
import { CourseStatus } from '../../common/enums/course-status.enum';

export class CreateCourseDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @ApiProperty({ example: 'string_example' })
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(20)
  @ApiProperty({ example: 'string_example' })
  description!: string;

  @IsString()
  @IsNotEmpty()
  @IsUrl()
  @ApiProperty({ example: 'string_example' })
  thumbnail!: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false, example: '507f1f77bcf86cd799439011' })
  thumbnailPublicId?: string;

  @IsEnum(CourseLevel)
  @ApiProperty()
  level!: CourseLevel;

  @IsMongoId()
  @IsNotEmpty()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  categoryId!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ required: false, example: 'string_example' })
  goals?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ required: false, example: 'string_example' })
  requirements?: string[];

  @IsOptional()
  @IsEnum(CourseStatus)
  @ApiProperty({ required: false })
  courseStatus?: CourseStatus;
}
