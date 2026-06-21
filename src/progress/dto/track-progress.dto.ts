import { IsMongoId, IsNotEmpty, IsNumber, IsBoolean, Min } from 'class-validator';

export class TrackProgressDto {
  @IsMongoId()
  @IsNotEmpty()
  lessonId: string;

  @IsNumber()
  @Min(0)
  watchedDuration: number;

  @IsBoolean()
  isCompleted: boolean;
}
