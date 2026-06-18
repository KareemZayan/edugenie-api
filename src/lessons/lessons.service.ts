import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Course } from '../courses/schema/course.schema';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { CoursesService } from '../courses/courses.service';
import { UpdateLessonDto } from './dto/update-lesson.dto';

import { EnrollmentsService } from '../enrollments/enrollments.service';
import { Progress } from '../progress/schema/progress.schema';
import { ForbiddenException } from '@nestjs/common';

@Injectable()
export class LessonsService {
  constructor(
    @InjectModel(Course.name) private courseModel: Model<Course>,
    @InjectModel(Progress.name) private progressModel: Model<Progress>,
    private coursesService: CoursesService,
    private enrollmentsService: EnrollmentsService,
  ) { }

  async addLesson(
    courseId: string,
    sectionId: string,
    instructorId: string,
    createLessonDto: CreateLessonDto,
  ) {
    const updated = await this.courseModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(courseId),
          instructorId: new Types.ObjectId(instructorId),
          'sections._id': new Types.ObjectId(sectionId),
        },
        { $push: { 'sections.$.lessons': createLessonDto } },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updated)
      throw new NotFoundException('Invalid Course, Section, or Ownership');

    await this.coursesService.syncMetadata(courseId);
    return updated.toObject().sections;
  }

  async getLessonById(
    courseId: string,
    sectionId: string,
    lessonId: string,
    instructorId: string,
  ) {
    const lesson = await this.courseModel.findOne({
      _id: new Types.ObjectId(courseId),
      instructorId: new Types.ObjectId(instructorId),
      'sections._id': new Types.ObjectId(sectionId),
      'sections.lessons._id': new Types.ObjectId(lessonId),
    }, { 'sections.$': 1, 'sections.$.lessons': 1 })
      .exec();

    if (!lesson)
      throw new NotFoundException('Invalid Course, Section, or Lesson');

    const found = lesson.sections[0].lessons.find((l) => l._id.toString() === lessonId);
    return found ? found.toObject() : null;
  }

  async findOneForStudent(lessonId: string, studentId: string) {
    const course = await this.courseModel.findOne(
      { 'sections.lessons._id': new Types.ObjectId(lessonId) },
      { 'sections.$': 1 }
    ).exec();

    if (!course || !course.sections || course.sections.length === 0) {
      throw new NotFoundException('Lesson not found');
    }

    const section = course.sections[0];
    const lesson = section.lessons.find((l) => l._id.toString() === lessonId);

    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    const hasAccess = await this.enrollmentsService.canAccessLesson(studentId, lessonId);
    if (!hasAccess) {
      throw new ForbiddenException('You must be enrolled in this course to view this lesson');
    }

    await this.progressModel.findOneAndUpdate(
      { studentId: new Types.ObjectId(studentId), lessonId: new Types.ObjectId(lessonId) },
      {
        $set: {
          lastWatchedAt: new Date(),
          courseId: course._id,
        }
      },
      { upsert: true, new: true }
    );

    return {
      _id: lesson._id.toString(),
      title: lesson.title,
      videoUrl: lesson.videoUrl,
      videoDuration: lesson.videoDuration,
      transcript: lesson.transcript || null,
      sectionId: section._id.toString(),
    };
  }

  async updateLesson(
    courseId: string,
    sectionId: string,
    lessonId: string,
    instructorId: string,
    updateLessonDto: UpdateLessonDto,
  ) {
    if (!updateLessonDto || Object.keys(updateLessonDto).length === 0) {
      throw new BadRequestException(
        'Update data (Request Body) cannot be empty',
      );
    }

    const updateFields: Record<string, any> = {};

    Object.keys(updateLessonDto).forEach((key) => {
      const safeKey = key as keyof UpdateLessonDto;
      updateFields[`sections.$[s].lessons.$[l].${safeKey}`] =
        updateLessonDto[safeKey];
    });

    const updated = await this.courseModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(courseId),
          instructorId: new Types.ObjectId(instructorId),
        },
        { $set: updateFields },
        {
          arrayFilters: [
            { 's._id': new Types.ObjectId(sectionId) },
            { 'l._id': new Types.ObjectId(lessonId) },
          ],
          returnDocument: 'after',
          runValidators: true,
        },
      )
      .exec();

    if (!updated)
      throw new BadRequestException(
        'Update failed: Course/Section not found or Unauthorized',
      );

    await this.coursesService.syncMetadata(courseId);
    return updated.toObject().sections;
  }

  async removeLesson(
    courseId: string,
    sectionId: string,
    lessonId: string,
    instructorId: string,
  ) {
    const updated = await this.courseModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(courseId),
          instructorId: new Types.ObjectId(instructorId),
          'sections._id': new Types.ObjectId(sectionId),
        },
        {
          $pull: {
            'sections.$.lessons': { _id: new Types.ObjectId(lessonId) },
          },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updated) throw new BadRequestException('Delete failed');

    await this.coursesService.syncMetadata(courseId);
    return { success: true, message: 'Lesson removed successfully' };
  }

  async reorderLessons(
    courseId: string,
    sectionId: string,
    instructorId: string,
    lessonIds: string[],
  ) {
    const course = await this.courseModel.findOne({
      _id: new Types.ObjectId(courseId),
      instructorId: new Types.ObjectId(instructorId),
    });

    if (!course)
      throw new NotFoundException('Course not found or unauthorized');
    const sectionIndex = course.sections.findIndex(
      (s) => s._id.toString() === sectionId,
    );

    if (sectionIndex === -1) throw new NotFoundException('Section not found');

    const section = course.sections[sectionIndex];

    const lessonMap = new Map(
      section.lessons.map((l) => [l._id.toString(), l]),
    );

    if (lessonIds.length !== lessonMap.size) {
      throw new BadRequestException(
        'lessonIds count does not match section lessons',
      );
    }

    const reordered = lessonIds.map((id) => {
      const lesson = lessonMap.get(id);
      if (!lesson)
        throw new BadRequestException(`Lesson ${id} not found in this section`);
      return lesson;
    });

    const lessons = course.sections[sectionIndex].lessons;

    lessons.splice(0, lessons.length, ...reordered);

    course.markModified('sections');
    await course.save();

    return course.toObject().sections;
  }
}
