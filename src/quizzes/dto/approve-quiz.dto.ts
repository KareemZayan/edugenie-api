import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsArray,
  IsString,
  IsNotEmpty,
  IsEnum,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QuestionType } from '../../common/enums/questionsType.enum';

class EditedQuestionDto {
  // Present  -> instructor is editing an existing AI-generated question,
  //             OR toggling its isIgnored state.
  // Absent   -> this is a brand-new question authored by the instructor.
  @IsOptional()
  @IsString()
  @ApiProperty({ required: false, description: 'Existing question _id. Omit for a new instructor-authored question.' })
  questionId?: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: 'string_example' })
  questionText!: string;

  @IsEnum(QuestionType)
  @ApiProperty({ enum: QuestionType })
  type!: QuestionType;

  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ example: ['string_example'], type: [String] })
  options!: string[];

  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ example: ['string_example'], type: [String] })
  correctAnswers!: string[];

  // Optional explicit soft-delete toggle. If provided and questionId is
  // provided, the existing question's isIgnored flag is set to this value.
  @IsOptional()
  @IsBoolean()
  @ApiProperty({ required: false, description: 'Set true to hide this question from students without deleting it.' })
  isIgnored?: boolean;
}

export class ApproveQuizDto {
  @IsOptional()
  @IsString()
  @ApiProperty({ required: false, description: 'Required for new manual quizzes' })
  sectionId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EditedQuestionDto)
  @ApiProperty({ required: false, type: [EditedQuestionDto] })
  editedQuestions?: EditedQuestionDto[];
}

export { EditedQuestionDto };
