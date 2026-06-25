import { ApiProperty } from '@nestjs/swagger';

import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DeactivateUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @ApiProperty({
    example: 'Violated terms of service',
    description: 'Reason for deactivation',
  })
  reason!: string;
}
