import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsUrl,
  IsNumber,
  Min,
  IsOptional,
} from 'class-validator';

export class CreateLessonDto {
  @IsString()
  @IsNotEmpty({ message: 'Lesson title is required' })
  @ApiProperty({ example: 'string_example' })
  title!: string;

  @IsUrl({}, { message: 'Invalid video URL' })
  @IsNotEmpty()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  videoUrl!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  videoPublicId!: string;

  @IsNumber()
  @Min(1)
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  videoDuration!: number;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false, example: 'string_example' })
  transcript?: string;
}

import { OmitType } from '@nestjs/mapped-types';

export class UploadLessonVideoDto extends OmitType(CreateLessonDto, [
  'videoUrl',
  'videoPublicId',
  'videoDuration',
] as const) {}
