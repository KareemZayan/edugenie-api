import { IsEnum, IsMongoId, IsNumber, Max, Min } from "class-validator";
import { QuestionType } from "../../common/enums/questionsType.enum";
import { QuizDifficulty } from "../../common/enums/quizDifficulty.enum";

export class CreateQuizDto {
  @IsMongoId()
  sectionId: string;

  @IsEnum(QuizDifficulty)
  difficulty: QuizDifficulty;

  @IsNumber()
  @Min(10)
  @Max(20)
  numberOfQuestions: number;

  @IsEnum(QuestionType)
  questionType: QuestionType;
}