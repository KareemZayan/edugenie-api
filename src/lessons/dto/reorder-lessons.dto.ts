import { ApiProperty } from '@nestjs/swagger';

import { IsArray, IsMongoId } from 'class-validator';

export class ReorderLessonsDto {
  @IsArray()
  @IsMongoId({ each: true })
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  lessonIds!: string[];
}
