import { IsArray, IsMongoId } from 'class-validator';

export class ReorderSectionsDto {
  @IsArray()
  @IsMongoId({ each: true })
  sectionIds!: string[];
}