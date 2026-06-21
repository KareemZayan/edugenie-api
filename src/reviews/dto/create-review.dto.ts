import { IsMongoId, IsNumber, IsString, Max, Min } from 'class-validator';

export class CreateReviewDto {
  @IsMongoId()
  courseId: string;

  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @IsString()
  comment: string;
}
