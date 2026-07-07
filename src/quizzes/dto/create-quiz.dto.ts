import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  ArrayNotEmpty,
  ArrayUnique,
  IsEnum,
  IsMongoId,
  IsNumber,
  Min,
  IsOptional,
} from 'class-validator';
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
  @Min(1)
  @ApiProperty({ example: 10, description: 'Number of NEW AI questions to generate. Maximum is dynamic: MAX_QUESTIONS_PER_QUIZ minus persisted question count.' })
  numberOfQuestions: number;

  /**
   * Allowed AI generation types for this request.
   * Must contain at least one element; duplicates are not permitted.
   * Determines which question types the AI may produce.
   */
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(QuestionType, { each: true })
  @ApiProperty({
    enum: QuestionType,
    isArray: true,
    example: [QuestionType.SINGLE_CHOICE, QuestionType.TRUE_FALSE],
    description: 'Allowed question types for AI generation. Array must contain at least one element.',
  })
  questionTypes: QuestionType[];

  /**
   * Optional quizId for appending AI questions to an existing manual quiz.
   * If provided, new AI questions will be added to this quiz instead of creating a new one.
   */
  @IsOptional()
  @IsMongoId()
  @ApiProperty({ 
    required: false, 
    example: '507f1f77bcf86cd799439011',
    description: 'Optional quizId for appending AI questions to an existing manual quiz.'
  })
  quizId?: string;
}
