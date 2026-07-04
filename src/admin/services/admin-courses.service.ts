import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Course, CourseDocument } from '../../courses/schema/course.schema';
import {
  AuditLog,
  AuditLogDocument,
} from '../../audit-logs/schemas/audit-log.schema';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType } from '../../notifications/enums/notification-type.enum';
import { CourseStatus } from '../../common/enums/course-status.enum';
import { PaginateQueryDto } from '../../common/dto/paginate-query.dto';
import { RejectCourseDto } from '../dto/reject-course.dto';
import { IndexingService } from '../../rag/indexing.service';
import {
  PendingCourseListResponse,
  CourseReviewDetailResponse,
  CourseApprovalResponse,
  CourseRejectionResponse,
  RejectedCourseListResponse,
} from '../../common/interfaces/frontend-contracts';

@Injectable()
export class AdminCoursesService {
  constructor(
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLogDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly indexing: IndexingService,
  ) {}

  async getPendingReviews(
    query: PaginateQueryDto,
  ): Promise<PendingCourseListResponse> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const [courses, total] = await Promise.all([
      this.courseModel
        .find({ courseStatus: CourseStatus.UNDER_REVIEW })
        .populate('instructorId', 'firstName lastName email avatar')
        .populate('categoryId', 'name')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.courseModel
        .countDocuments({ courseStatus: CourseStatus.UNDER_REVIEW })
        .exec(),
    ]);

    const data = courses.map((course) => {
      const instructor = course.instructorId as any;
      const category = course.categoryId as any;
      return {
        courseId: course._id.toString(),
        title: course.title,
        thumbnail: course.thumbnail,
        thumbnailPublicId: course.thumbnailPublicId,
        level: course.level,
        price: course.price,
        totalHours: course.totalHours,
        category:
          category && category._id
            ? { id: category._id.toString(), name: category.name }
            : null,
        instructorId: instructor._id.toString(),
        instructorName: `${instructor.firstName} ${instructor.lastName}`,
        instructor: {
          id: instructor._id.toString(),
          firstName: instructor.firstName,
          lastName: instructor.lastName,
          email: instructor.email,
          avatar: instructor.avatar,
        },
        submittedAt: (course as any).updatedAt,
        totalSections: course.sections.length,
        totalLessons: course.sections.reduce(
          (acc, sec) => acc + sec.lessons.length,
          0,
        ),
      };
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    };
  }

  async getRejectedCourses(
    query: PaginateQueryDto,
  ): Promise<RejectedCourseListResponse> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const [courses, total] = await Promise.all([
      this.courseModel
        .find({ courseStatus: CourseStatus.REJECTED })
        .populate('instructorId', 'firstName lastName email avatar')
        .populate('categoryId', 'name')
        .populate('rejectedBy', 'firstName lastName')
        .sort({ rejectedAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.courseModel
        .countDocuments({ courseStatus: CourseStatus.REJECTED })
        .exec(),
    ]);

    const data = courses.map((course) => {
      const instructor = course.instructorId as any;
      const category = course.categoryId as any;
      const admin = course.rejectedBy as any;
      return {
        courseId: course._id.toString(),
        title: course.title,
        thumbnail: course.thumbnail,
        thumbnailPublicId: course.thumbnailPublicId,
        level: course.level,
        price: course.price,
        totalHours: course.totalHours,
        category:
          category && category._id
            ? { id: category._id.toString(), name: category.name }
            : null,
        instructorId: instructor?._id?.toString() || '',
        instructorName: instructor
          ? `${instructor.firstName} ${instructor.lastName}`
          : 'Unknown',
        instructor: instructor
          ? {
              id: instructor._id.toString(),
              firstName: instructor.firstName,
              lastName: instructor.lastName,
              email: instructor.email,
              avatar: instructor.avatar,
            }
          : null,
        rejectionReason: course.rejectionReason || 'No reason provided',
        rejectedBy: admin
          ? `${admin.firstName} ${admin.lastName}`
          : 'Unknown Admin',
        rejectedAt: course.rejectedAt || (course as any).updatedAt,
      };
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    };
  }

  async getReviewDetail(id: string): Promise<CourseReviewDetailResponse> {
    const course = await this.courseModel
      .findById(id)
      .populate('instructorId', 'firstName lastName email')
      .exec();
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const instructor = course.instructorId as any;

    return {
      courseId: course._id.toString(),
      title: course.title,
      description: course.description,
      price: course.price,
      instructor: {
        id: instructor._id.toString(),
        name: `${instructor.firstName} ${instructor.lastName}`,
        email: instructor.email,
      },
      sections: course.sections.map((sec) => ({
        sectionId: sec._id.toString(),
        title: sec.title,
        lessons: sec.lessons.map((les) => ({
          lessonId: les._id.toString(),
          title: les.title,
          videoDuration: les.videoDuration,
          videoUrl: les.videoUrl,
        })),
      })),
      submittedAt: (course as any).updatedAt,
    };
  }

  async approveCourse(
    id: string,
    adminId: string,
  ): Promise<CourseApprovalResponse> {
    console.log(`[APPROVE] Admin ${adminId} approving course ${id}`);
    const course = await this.courseModel.findById(id).exec();
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    if (course.courseStatus !== CourseStatus.UNDER_REVIEW) {
      throw new BadRequestException('Course is not pending review');
    }

    console.log(`[APPROVE] Instructor ID: ${course.instructorId}`);
    course.courseStatus = CourseStatus.PUBLISHED;
    (course as any).approvedBy = new Types.ObjectId(adminId);
    (course as any).approvedAt = new Date();
    await course.save();

    // Published → index it for roadmap recommendations (non-throwing).
    await this.indexing.onCourseChanged(course._id.toString());

    await this.auditLogModel.create({
      action: 'COURSE_APPROVED',
      performedBy: new Types.ObjectId(adminId),
      targetUser: course.instructorId,
      details: { courseId: course._id.toString(), courseTitle: course.title },
    });

    console.log(`[APPROVE] Sending notification to instructor ${course.instructorId}`);
    await this.notificationsService.create(
      course.instructorId as Types.ObjectId,
      'Course Approved',
      `Your course '${course.title}' was approved!`,
      NotificationType.COURSE_APPROVED,
      course._id.toString(),
    );

    return {
      courseId: course._id.toString(),
      status: CourseStatus.PUBLISHED,
      approvedBy: adminId,
      approvedAt: (course as any).approvedAt,
    };
  }

  async rejectCourse(
    id: string,
    adminId: string,
    dto: RejectCourseDto,
  ): Promise<CourseRejectionResponse> {
    console.log(`[REJECT] Admin ${adminId} rejecting course ${id}`);
    const course = await this.courseModel.findById(id).exec();
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    if (course.courseStatus !== CourseStatus.UNDER_REVIEW) {
      throw new BadRequestException('Course is not pending review');
    }

    if (!dto.rejectionReason) {
      throw new BadRequestException('Rejection reason is required');
    }

    console.log(`[REJECT] Instructor ID: ${course.instructorId}`);
    course.courseStatus = CourseStatus.REJECTED;
    course.rejectionReason = dto.rejectionReason;
    course.rejectedBy = new Types.ObjectId(adminId);
    course.rejectedAt = new Date();
    await course.save();

    // Rejected → ensure it's not in the catalog index (non-throwing).
    await this.indexing.onCourseChanged(course._id.toString());

    await this.auditLogModel.create({
      action: 'COURSE_REJECTED',
      performedBy: new Types.ObjectId(adminId),
      targetUser: course.instructorId,
      details: {
        courseId: course._id.toString(),
        courseTitle: course.title,
        rejectionReason: dto.rejectionReason,
      },
    });

    console.log(`[REJECT] Sending notification to instructor ${course.instructorId}`);
    await this.notificationsService.create(
      course.instructorId as Types.ObjectId,
      'Course Rejected',
      `Your course '${course.title}' was rejected. Reason: ${dto.rejectionReason}`,
      NotificationType.COURSE_REJECTED,
      course._id.toString(),
    );

    return {
      courseId: course._id.toString(),
      status: CourseStatus.REJECTED,
      rejectionReason: course.rejectionReason,
      rejectedBy: adminId,
      rejectedAt: course.rejectedAt,
    };
  }
}
