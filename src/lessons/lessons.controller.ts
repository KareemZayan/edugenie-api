import { Controller, Post, Get, Patch, Delete, Param, Body } from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { CreateLessonDto } from './dto/create-lesson.dto';

@Controller('courses/:courseId/sections/:sectionId/lessons')
export class LessonsController {
    constructor(private readonly lessonsService: LessonsService) { }

    //CREATE
    @Post()
    addLesson(
        @Param('courseId') courseId: string,
        @Param('sectionId') sectionId: string,
        @Body() dto: CreateLessonDto,
    ) {
        return this.lessonsService.addLesson(courseId, sectionId, dto);
    }

    //GET ALL
    @Get()
    getAll(
        @Param('courseId') courseId: string,
        @Param('sectionId') sectionId: string,
    ) {
        return this.lessonsService.getLessons(courseId, sectionId);
    }

    // GET ONE
    @Get(':lessonId')
    getOne(
        @Param('courseId') courseId: string,
        @Param('sectionId') sectionId: string,
        @Param('lessonId') lessonId: string,
    ) {
        return this.lessonsService.getLesson(courseId, sectionId, lessonId);
    }

    // UPDATE
    @Patch(':lessonId')
    update(
        @Param('courseId') courseId: string,
        @Param('sectionId') sectionId: string,
        @Param('lessonId') lessonId: string,
        @Body() dto: Partial<CreateLessonDto>,
    ) {
        return this.lessonsService.updateLesson(
            courseId,
            sectionId,
            lessonId,
            dto,
        );
    }

    //  DELETE
    @Delete(':lessonId')
    remove(
        @Param('courseId') courseId: string,
        @Param('sectionId') sectionId: string,
        @Param('lessonId') lessonId: string,
    ) {
        return this.lessonsService.deleteLesson(
            courseId,
            sectionId,
            lessonId,
        );
    }
}