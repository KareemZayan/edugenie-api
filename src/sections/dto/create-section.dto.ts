import { IsString, IsArray, IsOptional, IsBoolean, MinLength } from 'class-validator';

export class CreateSectionDto {
    @IsString()
    title!: string;

    @IsString()
    @MinLength(10)
    description!: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    expectedOutcomes?: string[];

    @IsOptional()
    @IsBoolean()
    isBasicSection?: boolean;
}