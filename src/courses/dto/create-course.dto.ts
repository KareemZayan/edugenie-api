import { IsString, IsNumber, IsEnum, IsArray, IsMongoId, IsOptional, Min, MinLength, IsNotEmpty } from 'class-validator';
import { CourseLevel } from '../../shared/enums/level.enum';

export class CreateCourseDto {
    @IsString()
    @IsNotEmpty()
    @MinLength(5, { message: 'Title is too short' })
    title!: string;

    @IsString()
    @IsNotEmpty()
    @MinLength(20, { message: 'Description must be detailed' })
    description!: string;

    @IsNumber()
    @Min(0)
    @IsNotEmpty()
    price!: number;

    @IsString()
    @IsNotEmpty()
    thumbnail!: string;

    @IsEnum(CourseLevel)
    level!: CourseLevel;

    @IsMongoId({ message: 'Instructor must be a valid Mongo ID' })
    instructorId!: string;

    @IsMongoId({ message: 'Category must be a valid Mongo ID' })
    categoryId!: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    goals?: string[];

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    requirements?: string[];
}