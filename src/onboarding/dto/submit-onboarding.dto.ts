import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * One-time onboarding answers a student submits right after email verification.
 * Raw answers are stored on the user (for later editing) and distilled into a
 * natural-language profile string that feeds the AI roadmap/RAG.
 */
export class SubmitOnboardingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  specialization!: string;

  @IsString()
  @IsIn(['beginner', 'intermediate', 'advanced'])
  currentLevel!: string;

  // Free-form so the wizard can offer buckets ("2-4 hours", "5-10 hours") or a
  // custom answer without a schema migration.
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  hoursPerWeek!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  pace!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  priorExperience!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  endGoal!: string;

  @IsOptional()
  @IsString()
  @IsIn(['theory-first', 'hands-on-first'])
  learningStyle?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(30)
  @MaxLength(60, { each: true })
  knownTopics?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(30)
  @MaxLength(60, { each: true })
  focusTopics?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(600)
  extraNotes?: string;
}
