import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateLessonPlaceholderDto {
  @IsString()
  @IsNotEmpty({ message: 'Lesson title is required' })
  @ApiProperty({ example: 'Introduction to the Course' })
  title!: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  description?: string;
}