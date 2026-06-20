import { IsNotEmpty, IsOptional, IsString, MaxLength, Matches } from "class-validator";

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/)
  slug!: string;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  description?: string;
}