import { Type } from 'class-transformer';
import { IsArray, IsString, ValidateNested } from 'class-validator';

class PlacementAnswerDto {
  @IsString()
  questionId: string;

  /** Selected option text(s). Single-choice questions send one entry. */
  @IsArray()
  @IsString({ each: true })
  selected: string[];
}

export class SubmitPlacementDto {
  @IsString()
  attemptId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlacementAnswerDto)
  answers: PlacementAnswerDto[];
}
