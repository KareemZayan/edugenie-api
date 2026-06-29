import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { QuizDifficulty } from '../../common/enums/quizDifficulty.enum';

export class GeneratePracticeQuizDto {
  /** The section to drill (must be one the student can access). */
  @IsMongoId()
  sectionId: string;

  @IsOptional()
  @IsEnum(QuizDifficulty)
  difficulty?: QuizDifficulty;

  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(10)
  numberOfQuestions?: number;
}
