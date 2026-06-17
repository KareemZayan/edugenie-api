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
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(20)
  description!: string;

  @IsString()
  @IsNotEmpty()
  @IsUrl()
  thumbnail!: string;

  @IsOptional()
  @IsString()
  thumbnailPublicId?: string;

  @IsEnum(CourseLevel)
  level!: CourseLevel;

  @IsMongoId()
  @IsNotEmpty()
  categoryId!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  goals?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requirements?: string[];

  @IsOptional()
  @IsEnum(CourseStatus)
  courseStatus?: CourseStatus;
}
