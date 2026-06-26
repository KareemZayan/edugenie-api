import { ApiProperty } from '@nestjs/swagger';

import { IsNotEmpty, IsString, Length } from 'class-validator';

export class RedeemHandoffCodeDto {
  @IsString()
  @IsNotEmpty()
  @Length(32, 32)
  @ApiProperty({ example: 'a1b2c3d4e5f6789012345678901234ab' })
  code: string;
}
