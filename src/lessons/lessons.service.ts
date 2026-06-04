import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Course } from '../courses/schemas/course.schema';
import { CreateLessonDto } from './dto/create-lesson.dto';

@Injectable()
export class LessonsService {
    constructor(
        @InjectModel(Course.name)
        private courseModel: Model<Course>,
    ) { }

    private async getCourse(courseId: string) {
        const course = await this.courseModel.findById(courseId);

        if (!course) {
            throw new NotFoundException('Course not found');
        }

        return course;
    }

    // ADD LESSON
    async addLesson(courseId: string, sectionId: string, dto: CreateLessonDto) {
        const course = await this.getCourse(courseId);

        const section = (course.sections as any).id(sectionId);

        if (!section) throw new NotFoundException('Section not found');

        const newLesson = { ...dto };

        section.lessons.push(newLesson);

        course.totalLessons += 1;
        course.totalVideos += 1;

        await course.save();

        return section.lessons;
    }

    // GET ALL LESSONS
    async getLessons(courseId: string, sectionId: string) {
        const course = await this.getCourse(courseId);

        const section = (course.sections as any).id(sectionId);

        if (!section) throw new NotFoundException('Section not found');

        return section.lessons;
    }

    //  GET ONE LESSON
    async getLesson(courseId: string, sectionId: string, lessonId: string) {
        const course = await this.getCourse(courseId);

        const section = (course.sections as any).id(sectionId);

        if (!section) throw new NotFoundException('Section not found');

        const lesson = section.lessons.id(lessonId);

        if (!lesson) throw new NotFoundException('Lesson not found');

        return lesson;
    }

    // UPDATE LESSON
    async updateLesson(
        courseId: string,
        sectionId: string,
        lessonId: string,
        dto: Partial<CreateLessonDto>,
    ) {
        const course = await this.getCourse(courseId);

        const section = (course.sections as any).id(sectionId);

        if (!section) throw new NotFoundException('Section not found');

        const lesson = section.lessons.id(lessonId);

        if (!lesson) throw new NotFoundException('Lesson not found');

        Object.assign(lesson, dto);

        await course.save();

        return lesson;
    }

    // DELETE LESSON
    async deleteLesson(courseId: string, sectionId: string, lessonId: string) {
        const course = await this.getCourse(courseId);

        const section = (course.sections as any).id(sectionId);

        if (!section) throw new NotFoundException('Section not found');

        const lesson = section.lessons.id(lessonId);

        if (!lesson) throw new NotFoundException('Lesson not found');

        section.lessons.pull(lessonId);

        course.totalLessons -= 1;
        course.totalVideos -= 1;

        await course.save();

        return { message: 'Lesson deleted successfully' };
    }
}