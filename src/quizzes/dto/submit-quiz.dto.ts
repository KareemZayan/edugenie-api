import { IsObject } from 'class-validator';

export class SubmitQuizDto {
  // Map of questionIndex -> array of submitted answers
  @IsObject()
  answers: Record<string, string[]>;
}
