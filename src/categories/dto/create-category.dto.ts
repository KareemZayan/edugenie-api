import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class createCategoryDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

}