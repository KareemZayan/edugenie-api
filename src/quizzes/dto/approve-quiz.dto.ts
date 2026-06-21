import { IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { QuestionType } from '../../common/enums/questionsType.enum';

class EditedQuestionDto {
  questionText!: string;
  type!: QuestionType;
  options!: string[];
  correctAnswers!: string[];
}

export class ApproveQuizDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EditedQuestionDto)
  editedQuestions?: EditedQuestionDto[];
}
