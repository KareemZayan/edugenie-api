import { ApiProperty } from '@nestjs/swagger';

import { IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { QuestionType } from '../../common/enums/questionsType.enum';

class EditedQuestionDto {
  @ApiProperty({ example: 'string_example' })
  questionText!: string;
  @ApiProperty()
  type!: QuestionType;
  @ApiProperty({ example: 'string_example' })
  options!: string[];
  @ApiProperty({ example: 'string_example' })
  correctAnswers!: string[];
}

export class ApproveQuizDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EditedQuestionDto)
  @ApiProperty({ required: false })
  editedQuestions?: EditedQuestionDto[];
}
