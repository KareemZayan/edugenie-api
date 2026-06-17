import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SignUploadDto {
  @IsNotEmpty()
  @IsString()
  folder!: string;

  @IsOptional()
  @IsString()
  context?: string;
}
