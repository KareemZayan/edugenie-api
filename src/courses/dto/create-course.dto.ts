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
  @IsString()
  @IsUrl()
  @ApiProperty({ required: false, example: 'https://res.cloudinary.com/...' })
  previewVideoUrl?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false, example: 'courses/previews/abc123' })
  previewVideoPublicId?: string;

  // NOTE: courseStatus is intentionally NOT settable here. Status transitions
  // (draft → under_review → published/rejected) happen only through the
  // dedicated submit-for-review / admin-approval endpoints, so an instructor
  // cannot self-publish a course by mass-assigning this field on create/update.
}
