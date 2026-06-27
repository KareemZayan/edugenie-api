import { ApiProperty } from '@nestjs/swagger';

import {
  IsString,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  IsMongoId,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SubmitAnswerDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  questionId: string;

  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  selectedOptionIds: string[];
}

export class SubmitQuizDto {
  @IsMongoId()
  @IsNotEmpty()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  attemptId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitAnswerDto)
  @ArrayMinSize(1)
  @ApiProperty()
  answers: SubmitAnswerDto[];
}
