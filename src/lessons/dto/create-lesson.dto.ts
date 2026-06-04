import { IsString, IsNumber, IsOptional, MinLength } from 'class-validator';

export class CreateLessonDto {
    @IsString()
    title!: string;

    @IsString()
    videoUrl!: string;

    @IsString()
    videoPublicId!: string;

    @IsNumber()
    videoDuration!: number;

    @IsOptional()
    @IsString()
    @MinLength(5)
    transcript?: string;
}