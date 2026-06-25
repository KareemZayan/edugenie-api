import { ApiProperty } from '@nestjs/swagger';

import { IsEnum, IsMongoId, IsNumber, Max, Min } from 'class-validator';
import { QuestionType } from '../../common/enums/questionsType.enum';
import { QuizDifficulty } from '../../common/enums/quizDifficulty.enum';

export class CreateQuizDto {
  @IsMongoId()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  sectionId: string;

  @IsEnum(QuizDifficulty)
  @ApiProperty()
  difficulty: QuizDifficulty;

  @IsNumber()
  @Min(10)
  @Max(20)
  @ApiProperty({ example: 1 })
  numberOfQuestions: number;

  @IsEnum(QuestionType)
  @ApiProperty()
  questionType: QuestionType;
}
