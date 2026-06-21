import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectCourseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  rejectionReason!: string;
}
