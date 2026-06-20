import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Enrollment } from './schema/enrollment.schema';
import { PurchaseType } from '../common/enums/purchase-type.enum';
import { Course } from '../courses/schema/course.schema';

@Injectable()
export class EnrollmentsService {
  constructor(
    @InjectModel(Enrollment.name) private enrollmentModel: Model<Enrollment>,
    // We need the Course model to check how many total lessons exist!
    @InjectModel(Course.name) private courseModel: Model<Course>,
  ) { }

  async hasDuplicate(studentId: string, itemType: string, courseId: string, sectionId?: string): Promise<boolean> {
    const enrollment = await this.enrollmentModel.findOne({
      studentId: new Types.ObjectId(studentId),
      courseId: new Types.ObjectId(courseId)
    });

    if (!enrollment) return false;

    if (enrollment.type === PurchaseType.FULL_COURSE) {
      return true; // Already owns full course
    }

    if (itemType === PurchaseType.FULL_COURSE) {
      return false; // Can upgrade to full course
    }

    if (sectionId && enrollment.sectionIds.some(id => id.toString() === sectionId)) {
      return true; // Already owns this section
    }

    return false;
  }

  // 1. "My Learning" Dashboard: Get all courses the student owns
  async getMyEnrollments(studentId: string) {
    return this.enrollmentModel
      .find({ studentId: new Types.ObjectId(studentId) })
      // Populate course info so the frontend can display the course cards
      .populate('courseId', 'title thumbnail totalLessons')
      .sort({ updatedAt: -1 }) // Show recently watched courses first
      .exec();
  }

  // 2. Open a specific course: Get the progress to see which videos to unlock
  async getCourseProgress(studentId: string, courseId: string) {
    const enrollment = await this.enrollmentModel.findOne({
      studentId: new Types.ObjectId(studentId),
      courseId: new Types.ObjectId(courseId),
    }).exec();

    if (!enrollment) throw new ForbiddenException('You are not enrolled in this course.');
    return enrollment;
  }

  // 3. The Core Feature: Mark a video as complete and calculate the new %
  async markLessonComplete(studentId: string, courseId: string, lessonId: string) {
    // A. Find the enrollment
    const enrollment = await this.enrollmentModel.findOne({
      studentId: new Types.ObjectId(studentId),
      courseId: new Types.ObjectId(courseId),
    });

    if (!enrollment) throw new ForbiddenException('You are not enrolled in this course.');

    // B. Check if they already watched it (don't add duplicates)
    const lessonObjectId = new Types.ObjectId(lessonId);
    if (enrollment.completedLessons.includes(lessonObjectId)) {
      return { message: 'Lesson already completed', progress: enrollment.progressPercentage };
    }

    // C. Add the lesson to the completed array
    enrollment.completedLessons.push(lessonObjectId);

    // D. Fetch the course to see what the total number of lessons is
    const course = await this.courseModel.findById(courseId).select('totalLessons').exec();
    if (!course || course.totalLessons === 0) {
      throw new BadRequestException('Course metadata is broken.');
    }

    // E. Calculate the Math! (Completed / Total) * 100
    const rawPercentage = (enrollment.completedLessons.length / course.totalLessons) * 100;

    // Ensure it never goes above 100%, and round it to a whole number
    enrollment.progressPercentage = Math.min(Math.round(rawPercentage), 100);

    // F. If they hit 100%, trigger graduation!
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