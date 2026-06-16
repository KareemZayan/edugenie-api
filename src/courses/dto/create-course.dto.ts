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

  @IsNumber()
  @Type(() => Number)
  @Min(0)
  price!: number;

  @IsString()
  @IsNotEmpty()
  @IsUrl()
  thumbnail!: string;

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
