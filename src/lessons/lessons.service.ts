import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Course } from '../courses/schemas/course.schema';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { CoursesService } from '../courses/courses.service';

@Injectable()
export class LessonsService {
    constructor(
        @InjectModel(Course.name) private courseModel: Model<Course>,
        private coursesService: CoursesService
    ) { }


    async addLesson(courseId: string, sectionId: string, instructorId: string, dto: CreateLessonDto) {
        const updated = await this.courseModel.findOneAndUpdate(
            {
                _id: new Types.ObjectId(courseId),
                instructorId: new Types.ObjectId(instructorId),
                'sections._id': new Types.ObjectId(sectionId)
            },
            { $push: { 'sections.$.lessons': dto } },
            { new: true }
        ).exec();

        if (!updated) throw new NotFoundException('Invalid Course, Section, or Ownership');

        await this.coursesService.syncMetadata(courseId);
        return updated.sections;
    }


    async updateLesson(courseId: string, sectionId: string, lessonId: string, instructorId: string, dto: any) {


        if (!dto || Object.keys(dto).length === 0) {
            throw new BadRequestException('Update data (Request Body) cannot be empty');
        }

        const updateFields: Record<string, any> = {};

        Object.keys(dto).forEach(key => {
            updateFields[`sections.$[s].lessons.$[l].${key}`] = dto[key];
        });

        const updated = await this.courseModel.findOneAndUpdate(
            {
                _id: new Types.ObjectId(courseId),
                instructorId: new Types.ObjectId(instructorId)
            },
            { $set: updateFields },
            {
                arrayFilters: [
                    { 's._id': new Types.ObjectId(sectionId) },
                    { 'l._id': new Types.ObjectId(lessonId) }
                ],
                new: true
            }
        ).exec();

        if (!updated) throw new BadRequestException('Update failed: Course/Section not found or Unauthorized');

        await this.coursesService.syncMetadata(courseId);
        return updated.sections;
    }


    async removeLesson(courseId: string, sectionId: string, lessonId: string, instructorId: string) {
        const updated = await this.courseModel.findOneAndUpdate(
            {
                _id: new Types.ObjectId(courseId),
                instructorId: new Types.ObjectId(instructorId),
                'sections._id': new Types.ObjectId(sectionId)
            },
            { $pull: { 'sections.$.lessons': { _id: new Types.ObjectId(lessonId) } } },
            { new: true }
        ).exec();

        if (!updated) throw new BadRequestException('Delete failed');

        await this.coursesService.syncMetadata(courseId);
        return { success: true, message: 'Lesson removed successfully' };
    }
}