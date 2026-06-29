import { Type } from 'class-transformer';
import { IsArray, IsString, ValidateNested } from 'class-validator';

class PracticeAnswerDto {
  @IsString()
  questionId: string;

  /** Selected option text(s). Single-choice questions send one entry. */
  @IsArray()
  @IsString({ each: true })
  selected: string[];
}

export class SubmitPracticeQuizDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PracticeAnswerDto)
  answers: PracticeAnswerDto[];
}
