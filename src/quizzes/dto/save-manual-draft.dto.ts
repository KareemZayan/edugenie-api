import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsMongoId, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { EditedQuestionDto } from './approve-quiz.dto';

export class SaveManualDraftDto {
  @IsMongoId()
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  sectionId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EditedQuestionDto)
  @ApiProperty({ type: [EditedQuestionDto] })
  questions: EditedQuestionDto[];
}
