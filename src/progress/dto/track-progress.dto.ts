import { ApiProperty } from '@nestjs/swagger';

import {
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsBoolean,
  Min,
} from 'class-validator';

export class TrackProgressDto {
  @IsMongoId()
  @IsNotEmpty()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  lessonId: string;

  @IsNumber()
  @Min(0)
  @ApiProperty({ example: 1 })
  watchedDuration: number;

  @IsBoolean()
  @ApiProperty({ example: true })
  isCompleted: boolean;
}
