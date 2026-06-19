import { IsString, IsNotEmpty, IsArray, ValidateNested, ArrayMinSize, IsMongoId } from 'class-validator';
import { Type } from 'class-transformer';

export class SubmitAnswerDto {
  @IsString()
  @IsNotEmpty()
  questionId: string;

  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  selectedOptionIds: string[];
}

export class SubmitQuizDto {
  @IsMongoId()
  @IsNotEmpty()
  attemptId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitAnswerDto)
  @ArrayMinSize(1)
  answers: SubmitAnswerDto[];
}
