import { ApiProperty } from '@nestjs/swagger';

import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SignUploadDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ example: 'string_example' })
  folder!: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false, example: 'string_example' })
  context?: string;

  /**
   * Lesson-video uploads only: request google_speech transcription on the
   * original upload (adds signed raw_convert + notification_url to the params).
   */
  @IsOptional()
  @IsBoolean()
  @ApiProperty({ required: false, example: true })
  transcribe?: boolean;
}
