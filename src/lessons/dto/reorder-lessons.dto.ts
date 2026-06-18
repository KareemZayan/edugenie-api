import { IsArray, IsMongoId } from 'class-validator';

export class ReorderLessonsDto {
  @IsArray()
  @IsMongoId({ each: true })
  lessonIds!: string[];
}