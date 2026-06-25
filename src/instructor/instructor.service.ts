import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Course } from '../courses/schema/course.schema';
import { Earning } from '../orders/schema/earning.schema';
import { Enrollment } from '../enrollments/schema/enrollment.schema';
import { Review } from '../reviews/schema/review.schema';
import { Quiz } from '../quizzes/schema/quiz.schema';
import { Progress } from '../progress/schema/progress.schema';
import { InstructorStudentsFilterDto } from './dto/instructor-students-filter.dto';
import { CourseStatus } from '../common/enums/course-status.enum';
import {
  DashboardOverviewResponse,
  AttentionItemsResponse,
  AttentionItem,
  PaginatedResponse,
  InstructorStudentListItem,
} from '../common/interfaces/frontend-contracts';

@Injectable()
export class InstructorService {
  constructor(
    @InjectModel(Course.name) private courseModel: Model<Course>,
    @InjectModel(Earning.name) private earningModel: Model<Earning>,
    @InjectModel(Enrollment.name) private enrollmentModel: Model<Enrollment>,
    @InjectModel(Review.name) private reviewModel: Model<Review>,
    @InjectModel(Quiz.name) private quizModel: Model<Quiz>,
    @InjectModel(Progress.name) private progressModel: Model<Progress>,
  ) {}

  async getDashboardOverview(
    instructorId: string,
  ): Promise<DashboardOverviewResponse> {
    const instructorObjId = new Types.ObjectId(instructorId);

    // 1. Total Earnings
    const totalEarningsResult = await this.earningModel.aggregate([
      { $match: { instructorId: instructorObjId } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const totalEarnings = totalEarningsResult[0]?.total || 0;

    // 2. Earnings Change Percent
    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(now.getDate() - 60);

    const recentEarningsResult = await this.earningModel.aggregate([
      {
        $match: {
          instructorId: instructorObjId,
          createdAt: { $gte: thirtyDaysAgo },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const recentEarnings = recentEarningsResult[0]?.total || 0;

    const previousEarningsResult = await this.earningModel.aggregate([
      {
        $match: {
          instructorId: instructorObjId,
          createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const previousEarnings = previousEarningsResult[0]?.total || 0;

    let earningsChangePercent = 0;
    if (previousEarnings === 0) {
      earningsChangePercent = recentEarnings > 0 ? 100 : 0;
    } else {
      earningsChangePercent =
        ((recentEarnings - previousEarnings) / previousEarnings) * 100;
    }

    // 3. Get instructor courses
    const courses = await this.courseModel
      .find({ instructorId: instructorObjId })
      .select('_id')
      .exec();
    const courseIds = courses.map((c) => c._id);
    const totalCourses = courseIds.length;

    // 4. Total Students & New Students
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);

    const totalStudentsResult = await this.enrollmentModel.distinct(
      'studentId',
      { courseId: { $in: courseIds } },
    );
    const totalStudents = totalStudentsResult.length;

    const newStudentsResult = await this.enrollmentModel.distinct('studentId', {
      courseId: { $in: courseIds },
      createdAt: { $gte: sevenDaysAgo },
    });
    const newStudentsThisWeek = newStudentsResult.length;

    // 5. Average Rating
    const avgRatingResult = await this.reviewModel.aggregate([
      { $match: { courseId: { $in: courseIds } } },
      { $group: { _id: null, avg: { $avg: '$rating' } } },
    ]);
    const averageRating = avgRatingResult[0]?.avg || 0;

    // 6. Pending Payout
    const pendingPayoutResult = await this.earningModel.aggregate([
      { $match: { instructorId: instructorObjId, status: 'PENDING' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const pendingPayout = pendingPayoutResult[0]?.total || 0;

    // NOTE: nextPayoutDate is a placeholder — wire to real payout schedule when superadmin payout system is built
    const nextPayoutDate = new Date();
    nextPayoutDate.setDate(now.getDate() + (15 - (now.getDate() % 15)));

    return {
      totalEarnings,
      earningsChangePercent,
      totalStudents,
      newStudentsThisWeek,
      averageRating,
      totalCourses,
      pendingPayout,
      nextPayoutDate,
    };
  }

  async getAttentionItems(
    instructorId: string,
  ): Promise<AttentionItemsResponse> {
    const instructorObjId = new Types.ObjectId(instructorId);
    const items: AttentionItem[] = [];

    // 1. Rejected Courses
    const rejectedCourses = await this.courseModel
      .find({
        instructorId: instructorObjId,
        courseStatus: CourseStatus.REJECTED,
      })
      .select('_id title rejectionReason rejectedAt createdAt')
      .exec();

    rejectedCourses.forEach((c) => {
      items.push({
        type: 'course_rejected',
        courseId: c._id.toString(),
        courseTitle: c.title,
        rejectionReason: c.rejectionReason,
        createdAt:
          (c as unknown as { rejectedAt?: Date; createdAt?: Date })
            .rejectedAt ||
          (c as unknown as { createdAt?: Date }).createdAt ||
          new Date(),
      });
    });

    // 2. Low Reviews
    const courses = await this.courseModel
      .find({ instructorId: instructorObjId })
      .select('_id title sections')
      .exec();
    const courseIds = courses.map((c) => c._id);
    const courseMap = new Map(courses.map((c) => [c._id.toString(), c]));

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(new Date().getDate() - 14);

    const lowReviews = await this.reviewModel
      .find({
        courseId: { $in: courseIds },
        rating: { $lte: 2 },
        createdAt: { $gte: fourteenDaysAgo },
      })
      .exec();

    lowReviews.forEach((r) => {
      items.push({
        type: 'low_review',
        courseId: r.courseId.toString(),
        courseTitle:
          courseMap.get(r.courseId.toString())?.title || 'Unknown Course',
        reviewId: r._id.toString(),
        rating: r.rating,
        createdAt:
          (r as unknown as { createdAt?: Date }).createdAt || new Date(),
      });
    });

    // 3. Pending Quizzes
    const sectionIds: Types.ObjectId[] = [];
    const sectionToCourseMap = new Map<string, string>();

    courses.forEach((c) => {
      if (c.sections) {
        c.sections.forEach((s) => {
          sectionIds.push(s._id);
          sectionToCourseMap.set(s._id.toString(), c.title);
        });
      }
    });

    const pendingQuizzes = await this.quizModel
      .find({ sectionId: { $in: sectionIds }, status: 'pending_review' })
      .exec();

    pendingQuizzes.forEach((q) => {
      items.push({
        type: 'quiz_pending_review',
        sectionId: q.sectionId.toString(),
        courseTitle:
          sectionToCourseMap.get(q.sectionId.toString()) || 'Unknown Course',
        createdAt:
          (q as unknown as { createdAt?: Date }).createdAt || new Date(),
      });
    });

    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return {
      items: items.slice(0, 10),
    };
  }

  async getStudents(
    instructorId: string,
    filterDto: InstructorStudentsFilterDto,
  ): Promise<PaginatedResponse<InstructorStudentListItem>> {
    const { courseId, accessType, page = 1, limit = 10 } = filterDto;
    const instructorObjId = new Types.ObjectId(instructorId);

    // Verify courseId if provided
    let filterCourseIds: Types.ObjectId[] = [];
    if (courseId) {
      const course = await this.courseModel
        .findById(courseId)
        .select('instructorId')
        .exec();
      if (!course) {
        throw new NotFoundException('Course not found');
      }
      // OWNERSHIP CHECK ENFORCED: verifies that the filtered course belongs to the requesting instructor
      if (course.instructorId.toString() !== instructorId) {
        throw new ForbiddenException('You do not own this course');
      }
      filterCourseIds.push(new Types.ObjectId(courseId));
    } else {
      const courses = await this.courseModel
        .find({ instructorId: instructorObjId })
        .select('_id')
        .exec();
      filterCourseIds = courses.map((c) => c._id);
    }

    if (filterCourseIds.length === 0) {
      return {
        data: [],
        meta: {
          total: 0,
          page,
          limit,
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false,
        },
      };
    }

    const query: Record<string, unknown> = {
      courseId: { $in: filterCourseIds },
    };
    if (accessType) {
      query.type = accessType;
    }

    const skip = (page - 1) * limit;

    const [enrollments, total] = await Promise.all([
      this.enrollmentModel
        .find(query)
        .populate('studentId', 'firstName lastName email')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.enrollmentModel.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);

    const data: InstructorStudentListItem[] = enrollments.map((e) => {
      const student = e.studentId as unknown as {
        _id: Types.ObjectId;
        firstName: string;
        lastName: string;
        email: string;
      };
      return {
        studentId: student._id.toString(),
        studentName: `${student.firstName} ${student.lastName}`,
        studentEmail: student.email,
        courseId: e.courseId.toString(),
        accessType: e.type as 'full_course' | 'sections',
        accessibleSections: e.sectionIds.map((id) => id.toString()),
        progressPercent: e.progressPercentage || 0,
        enrolledAt:
          (e as unknown as { createdAt?: Date }).createdAt || new Date(),
      };
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }
}
