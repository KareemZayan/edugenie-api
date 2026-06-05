import {
    IsString, IsArray, IsOptional, IsBoolean,
    IsNotEmpty, MinLength, ArrayMaxSize,
} from 'class-validator';

export class CreateSectionDto {
    @IsString()
    @IsNotEmpty({ message: 'Section title is required' })
    @MinLength(3, { message: 'Section title is too short' })
    title!: string;

    @IsOptional()
    @IsString()
    @MinLength(10)
    description?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @ArrayMaxSize(20)
    expectedOutcomes?: string[];

    @IsOptional()
    @IsBoolean()
    isBasicSection?: boolean;
}