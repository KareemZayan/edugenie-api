import { IsNotEmpty, IsString } from 'class-validator';

export class SignUploadDto {
  @IsNotEmpty()
  @IsString()
  folder!: string;
}
