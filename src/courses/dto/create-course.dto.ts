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

  // NOTE: courseStatus is intentionally NOT settable here. Status transitions
  // (draft → under_review → published/rejected) happen only through the
  // dedicated submit-for-review / admin-approval endpoints, so an instructor
  // cannot self-publish a course by mass-assigning this field on create/update.
}
