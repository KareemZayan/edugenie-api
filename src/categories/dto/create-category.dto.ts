import { IsNotEmpty, IsOptional, IsString, MaxLength, Matches } from "class-validator";

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

}