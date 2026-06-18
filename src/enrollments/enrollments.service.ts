import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Enrollment } from './schema/enrollment.schema';
import { Course } from '../courses/schema/course.schema';
import { PaginateQueryDto } from '../common/dto/paginate-query.dto';

@Injectable()
export class EnrollmentsService {
  constructor(
    @InjectModel(Enrollment.name) private enrollmentModel: Model<Enrollment>,
    // We need the Course model to check how many total lessons exist!
    @InjectModel(Course.name) private courseModel: Model<Course>,
  ) { }

  // Phase 8 Access Guards
  async canAccessSection(studentId: string, sectionId: string): Promise<boolean> {
    const course = await this.courseModel.findOne({ 'sections._id': new Types.ObjectId(sectionId) }).select('_id');
    if (!course) return false;

    const courseId = course._id.toString();

    const enrollment = await this.enrollmentModel.findOne({
      studentId: new Types.ObjectId(studentId),
      courseId: new Types.ObjectId(courseId),
    });

    if (!enrollment) return false;

    if (enrollment.type === 'full_course') return true;

    return enrollment.sectionIds.map(id => id.toString()).includes(sectionId);
  }

  async canAccessLesson(studentId: string, lessonId: string): Promise<boolean> {
    const course = await this.courseModel.findOne({ 'sections.lessons._id': new Types.ObjectId(lessonId) });
    if (!course) return false;

    // Find which section this lesson belongs to
    let foundSectionId = null;
    for (const section of course.sections) {
      for (const lesson of section.lessons) {
        if (lesson._id.toString() === lessonId) {
          foundSectionId = section._id.toString();
          break;
        }
      }
      if (foundSectionId) break;
    }

    if (!foundSectionId) return false;

    return this.canAccessSection(studentId, foundSectionId);
  }

  // Phase 9: New Endpoint
  async getCourseAccess(studentId: string, courseId: string) {
    const course = await this.courseModel.findById(courseId).select('sections');
    if (!course) throw new NotFoundException('Course not found');

    const enrollment = await this.enrollmentModel.findOne({
      studentId: new Types.ObjectId(studentId),
      courseId: new Types.ObjectId(courseId),
    });

    if (!enrollment) {
      return {
        courseId,
        accessType: 'none',
        accessibleSections: [],
        totalSections: course.sections.length,
        enrolledAt: null,
      };
    }

    return {
      courseId,
      accessType: enrollment.type,
      accessibleSections: enrollment.type === 'full_course' 
        ? course.sections.map(s => s._id.toString()) 
        : enrollment.sectionIds.map(id => id.toString()),
      totalSections: course.sections.length,
      enrolledAt: (enrollment as any).createdAt,
    };
  }

  // 1. "My Learning" Dashboard: Get all courses the student owns
  async getMyEnrollments(studentId: string, query: PaginateQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const data = await this.enrollmentModel
      .find({ studentId: new Types.ObjectId(studentId) })
      // Populate course info so the frontend can display the course cards
      .populate('courseId', 'title thumbnail totalLessons')
      .sort({ updatedAt: -1 }) // Show recently watched courses first
      .skip(skip)
      .limit(limit)
      .exec();

    const total = await this.enrollmentModel.countDocuments({ studentId: new Types.ObjectId(studentId) });

    return {
      data: data.map(d => d.toObject()),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    };
  }

  // 2. Open a specific course: Get the progress to see which videos to unlock
  async getCourseProgress(studentId: string, courseId: string) {
    const enrollment = await this.enrollmentModel.findOne({
      studentId: new Types.ObjectId(studentId),
      courseId: new Types.ObjectId(courseId),
    }).exec();

    if (!enrollment) throw new ForbiddenException('You are not enrolled in this course.');
    return enrollment.toObject();
  }

  // 3. The Core Feature: Mark a video as complete and calculate the new %
  async markLessonComplete(studentId: string, courseId: string, lessonId: string) {
    // A. Check Access
    const hasAccess = await this.canAccessLesson(studentId, lessonId);
    if (!hasAccess) throw new ForbiddenException('You do not have access to this lesson.');

    // B. Find the enrollment
    const enrollment = await this.enrollmentModel.findOne({
      studentId: new Types.ObjectId(studentId),
      courseId: new Types.ObjectId(courseId),
    });

    if (!enrollment) throw new ForbiddenException('You are not enrolled in this course.');

    // C. Check if they already watched it (don't add duplicates)
    const lessonObjectId = new Types.ObjectId(lessonId);
    if (enrollment.completedLessons.includes(lessonObjectId)) {
      return { message: 'Lesson already completed', progress: enrollment.progressPercentage };
    }

    // D. Add the lesson to the completed array
    enrollment.completedLessons.push(lessonObjectId);

    // E. Fetch the course to see what the total number of lessons is
    const course = await this.courseModel.findById(courseId).select('totalLessons').exec();
    if (!course || course.totalLessons === 0) {
      throw new BadRequestException('Course metadata is broken.');
    }

    // F. Calculate the Math! (Completed / Total) * 100
    const rawPercentage = (enrollment.completedLessons.length / course.totalLessons) * 100;

    // Ensure it never goes above 100%, and round it to a whole number
    enrollment.progressPercentage = Math.min(Math.round(rawPercentage), 100);

    // G. If they hit 100%, trigger graduation!
    if (enrollment.progressPercentage === 100) {
      enrollment.isCourseCompleted = true;
      // Note: In Sprint 4, this is where we will trigger the Certificate Generation!
    }

    await enrollment.save();

    return {
      success: true,
      message: 'Progress updated!',
      progressPercentage: enrollment.progressPercentage,
      isCompleted: enrollment.isCourseCompleted
    };
  }
}