import { ApiProperty } from '@nestjs/swagger';

import {
  IsString,
  IsArray,
  IsOptional,
  IsNotEmpty,
  MinLength,
  ArrayMaxSize,
  IsNumber,
  Min,
  IsUrl,
} from 'class-validator';

export class CreateSectionDto {
  @IsString()
  @IsNotEmpty({ message: 'Section title is required' })
  @MinLength(3, { message: 'Section title is too short' })
  @ApiProperty({ example: 'string_example' })
  title!: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @ApiProperty({ required: false, example: 'string_example' })
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  @ApiProperty({ required: false, example: 'string_example' })
  expectedOutcomes?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @ApiProperty({ required: false, example: 1 })
  price?: number | null;

}
