import { ApiProperty } from '@nestjs/swagger';

import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectCourseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  @ApiProperty({ example: 'string_example' })
  rejectionReason!: string;
}
