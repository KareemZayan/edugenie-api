import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Enrollment } from './schema/enrollment.schema';
import { PurchaseType } from '../common/enums/purchase-type.enum';
import { Course } from '../courses/schema/course.schema';
import { PaginateQueryDto } from '../common/dto/paginate-query.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { MyCourseItem } from './interfaces/my-course-item.interface';

@Injectable()
export class EnrollmentsService {
  constructor(
    @InjectModel(Enrollment.name) private enrollmentModel: Model<Enrollment>,
    @InjectModel(Course.name) private courseModel: Model<Course>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async hasDuplicate(
    studentId: string,
    itemType: PurchaseType,
    courseId: string,
    sectionId?: string,
  ): Promise<boolean> {
    const enrollment = await this.enrollmentModel.findOne({
      studentId: new Types.ObjectId(studentId),
      courseId: new Types.ObjectId(courseId),
    });

    if (!enrollment) return false;

    if (enrollment.type === PurchaseType.FULL_COURSE) {
      return true; // Already owns full course
    }

    if (itemType === PurchaseType.FULL_COURSE) {
      return false; // Can upgrade to full course
    }

    if (itemType === PurchaseType.SECTION && sectionId) {
      return enrollment.sectionIds.some((id) => id.toString() === sectionId);
    }

    return false;
  }

  // Phase 8 Access Guards
  async canAccessSection(
    studentId: string,
    sectionId: string,
  ): Promise<boolean> {
    const course = await this.courseModel
      .findOne({ 'sections._id': new Types.ObjectId(sectionId) })
      .select('_id');
    if (!course) return false;

    const courseId = course._id.toString();

    const enrollment = await this.enrollmentModel.findOne({
      studentId: new Types.ObjectId(studentId),
      courseId: new Types.ObjectId(courseId),
    });

    if (!enrollment) return false;

    if (enrollment.type === PurchaseType.FULL_COURSE) return true;

    return enrollment.sectionIds.map((id) => id.toString()).includes(sectionId);
  }

  async canAccessLesson(studentId: string, lessonId: string): Promise<boolean> {
    const course = await this.courseModel.findOne({
      'sections.lessons._id': new Types.ObjectId(lessonId),
    });
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
      accessibleSections:
        enrollment.type === PurchaseType.FULL_COURSE
          ? course.sections.map((s) => s._id.toString())
          : enrollment.sectionIds.map((id) => id.toString()),
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
      .populate(
        'courseId',
        'title thumbnail thumbnailPublicId price level totalLessons',
      )
      .sort({ updatedAt: -1 }) // Show recently watched courses first
      .skip(skip)
      .limit(limit)
      .exec();

    const total = await this.enrollmentModel.countDocuments({
      studentId: new Types.ObjectId(studentId),
    });

    return {
      data: data.map((d) => d.toObject()),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // "My Courses": flat list of enrolled courses for the student dashboard
  async getMyCourses(userId: string): Promise<MyCourseItem[]> {
    const enrollments = await this.enrollmentModel
      .find({ studentId: new Types.ObjectId(userId) })
      // Join with Course to surface the card data (title + thumbnail + meta)
      .populate('courseId', 'title thumbnail thumbnailPublicId price level')
      .sort({ createdAt: -1 }) // most recently enrolled first
      .exec();

    return enrollments
      // Skip enrollments whose course has since been deleted
      .filter((enrollment) => enrollment.courseId)
      .map((enrollment) => {
        const course = enrollment.courseId as unknown as {
          _id: Types.ObjectId;
          title: string;
          thumbnail: string;
          thumbnailPublicId: string;
          price: number;
          level: string;
        };
        const enrolledAt = (enrollment as unknown as { createdAt: Date })
          .createdAt;

        return {
          courseId: course._id.toString(),
          title: course.title,
          thumbnail: course.thumbnail,
          thumbnailPublicId: course.thumbnailPublicId,
          price: course.price,
          level: course.level,
          progressPercent: enrollment.progressPercentage,
          enrolledAt: enrolledAt ? enrolledAt.toISOString() : '',
        };
      });
  }

  // 2. Open a specific course: Get the progress to see which videos to unlock
  async getCourseProgress(studentId: string, courseId: string) {
    const enrollment = await this.enrollmentModel
      .findOne({
        studentId: new Types.ObjectId(studentId),
        courseId: new Types.ObjectId(courseId),
      })
      .exec();

    if (!enrollment)
      throw new ForbiddenException('You are not enrolled in this course.');
    return enrollment.toObject();
  }

  // 3. The Core Feature: Mark a video as complete and calculate the new %
  // Full markLessonComplete method, updated with the 50% Goal Milestone notification.
  // Replace the existing method in enrollments.service.ts with this version.

  async markLessonComplete(
    studentId: string,
    courseId: string,
    lessonId: string,
  ) {
    // A. Check Access
    const hasAccess = await this.canAccessLesson(studentId, lessonId);
    if (!hasAccess)
      throw new ForbiddenException('You do not have access to this lesson.');

    // B. Find the enrollment
    const enrollment = await this.enrollmentModel.findOne({
      studentId: new Types.ObjectId(studentId),
      courseId: new Types.ObjectId(courseId),
    });

    if (!enrollment)
      throw new ForbiddenException('You are not enrolled in this course.');

    // C. Check if they already watched it (don't add duplicates)
    const lessonObjectId = new Types.ObjectId(lessonId);
    if (enrollment.completedLessons.includes(lessonObjectId)) {
      return {
        message: 'Lesson already completed',
        progress: enrollment.progressPercentage,
      };
    }

    // D. Add the lesson to the completed array
    enrollment.completedLessons.push(lessonObjectId);

    // E. Fetch the course to see what the total number of lessons is
    const course = await this.courseModel
      .findById(courseId)
      .select('totalLessons title')
      .exec();
    if (!course || course.totalLessons === 0) {
      throw new BadRequestException('Course metadata is broken.');
    }

    // F. Calculate the Math! (Completed / Total) * 100
    // Capture the OLD percentage before overwriting it — needed to detect the 50% crossing.
    const previousPercentage = enrollment.progressPercentage;
    const rawPercentage =
      (enrollment.completedLessons.length / course.totalLessons) * 100;

    // Ensure it never goes above 100%, and round it to a whole number
    enrollment.progressPercentage = Math.min(Math.round(rawPercentage), 100);

    // Goal Milestone — fires once, the moment progress crosses from below 50% to 50%+
    if (
      previousPercentage < 50 &&
      enrollment.progressPercentage >= 50 &&
      !enrollment.milestone50Notified
    ) {
      enrollment.milestone50Notified = true;

      await this.notificationsService.create(
        studentId,
        "You're halfway there!",
        `You're 50% done with "${course.title}", keep it up!`,
        NotificationType.GOAL_MILESTONE,
        courseId,
      );
    }

    // G. If they hit 100%, trigger graduation!
    if (enrollment.progressPercentage === 100) {
      enrollment.isCourseCompleted = true;

      // Fetch course title for the notification
      const fullCourse = await this.courseModel
        .findById(courseId)
        .select('title')
        .exec();

      await this.notificationsService.create(
        studentId,
        'Certificate Earned!',
        `You have earned a certificate for completing "${fullCourse?.title}".`,
        NotificationType.CERTIFICATE_EARNED,
        courseId,
      );
    }

    await enrollment.save();

    return {
      success: true,
      message: 'Progress updated!',
      progressPercentage: enrollment.progressPercentage,
      isCompleted: enrollment.isCourseCompleted,
    };
  }

  // Phase: New Content Published — find every student with access to a given section
  async getStudentIdsWithSectionAccess(
    courseId: string,
    sectionId: string,
  ): Promise<string[]> {
    const enrollments = await this.enrollmentModel
      .find({
        courseId: new Types.ObjectId(courseId),
        $or: [
          { type: PurchaseType.FULL_COURSE },
          {
            type: PurchaseType.SECTION,
            sectionIds: new Types.ObjectId(sectionId),
          },
        ],
      })
      .select('studentId')
      .exec();

    return enrollments.map((e) => e.studentId.toString());
  }
}
