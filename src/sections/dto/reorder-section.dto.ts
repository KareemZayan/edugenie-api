import { ApiProperty } from '@nestjs/swagger';

import { IsArray, IsMongoId } from 'class-validator';

export class ReorderSectionsDto {
  @IsArray()
  @IsMongoId({ each: true })
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  sectionIds!: string[];
}
