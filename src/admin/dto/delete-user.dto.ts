import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DeleteUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @ApiProperty({
    example: 'Violated terms of service',
    description: 'Reason for deleting the user',
  })
  reason!: string;
}
