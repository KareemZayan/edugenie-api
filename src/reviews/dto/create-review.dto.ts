import { ApiProperty } from '@nestjs/swagger';

import { IsMongoId, IsNumber, IsString, Max, Min } from 'class-validator';

export class CreateReviewDto {
  @IsMongoId()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  courseId: string;

  @IsNumber()
  @Min(1)
  @Max(5)
  @ApiProperty({ example: 1 })
  rating: number;

  @IsString()
  @ApiProperty({ example: 'string_example' })
  comment: string;
}
