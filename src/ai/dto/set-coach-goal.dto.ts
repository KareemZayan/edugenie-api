import { IsInt, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetCoachGoalDto {
  @ApiProperty({ minimum: 1, maximum: 20, description: 'Lessons to finish per week' })
  @IsInt()
  @Min(1)
  @Max(20)
  weeklyGoalLessons: number;
}
