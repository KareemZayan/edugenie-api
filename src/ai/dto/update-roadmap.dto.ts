import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * One edited item. Only ids + type are trusted from the client — title/price are
 * re-derived server-side against the published catalog (see validateAndPriceItems).
 */
export class RoadmapItemInput {
  @IsIn(['course', 'section'])
  type: 'course' | 'section';

  @IsMongoId()
  courseId: string;

  @IsOptional()
  @IsMongoId()
  sectionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}

export class RoadmapMilestoneInput {
  @IsString()
  @MaxLength(120)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  focus?: string;

  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => RoadmapItemInput)
  items: RoadmapItemInput[];
}

export class UpdateRoadmapDto {
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => RoadmapMilestoneInput)
  milestones: RoadmapMilestoneInput[];
}
