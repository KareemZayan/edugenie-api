import { ApiProperty } from '@nestjs/swagger';

import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SignUploadDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ example: 'string_example' })
  folder!: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false, example: 'string_example' })
  context?: string;
}
