import { IsString, IsNotEmpty, IsUrl, IsNumber, Min, IsOptional } from 'class-validator';

export class CreateLessonDto {
    @IsString()
    @IsNotEmpty({ message: 'Lesson title is required' })
    title!: string;

    @IsUrl({}, { message: 'Invalid video URL' })
    @IsNotEmpty()
    videoUrl!: string;

    @IsString()
    @IsNotEmpty()
    videoPublicId!: string;

    @IsNumber()
    @Min(1)
    videoDuration!: number;
    @IsOptional()
    @IsString()
    transcript?: string;
}