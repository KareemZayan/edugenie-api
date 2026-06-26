import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import * as mongoose from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Course } from './schema/course.schema';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { CourseStatus } from '../common/enums/course-status.enum';
import { Category } from '../categories/schema/category.schema';
import { Earning } from '../orders/schema/earning.schema';
import { CourseSerializer } from './serializers/course.serializer';
import { PaginatedResponse } from '../common/interfaces/paginated-response.interface';

import { Enrollment } from '../enrollments/schema/enrollment.schema';
import { Progress } from '../progress/schema/progress.schema';

import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { User } from '../users/schema/user.schema';

@Injectable()
export class CoursesService {
  constructor(
    @InjectModel(Course.name) private readonly courseModel: Model<Course>,
    @InjectModel(Category.name) private readonly categoryModel: Model<Category>,
    @InjectModel(Enrollment.name)
    private readonly enrollmentModel: Model<Enrollment>,
    @InjectModel(Progress.name) private readonly progressModel: Model<Progress>,
    @InjectModel(Earning.name) private readonly earningModel: Model<Earning>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(
    dto: CreateCourseDto,
    instructorId: string,
  ): Promise<CourseSerializer> {
    if (!instructorId)
      throw new BadRequestException('Instructor ID is required');

    const createdCourse = await this.courseModel.create({
      ...dto,
      instructorId: new Types.ObjectId(instructorId),
      courseStatus: CourseStatus.DRAFT,
      ratingAverage: 0,
      totalEnrollments: 0,
    });

    return new CourseSerializer(createdCourse.toObject());
  }

  async findAll(filterDto: {
    skip: number;
    limit: number;
    categoryId?: string;
    level?: string;
    search?: string;
    minPrice?: number;
    maxPrice?: number;
    minRating?: number;
    maxDuration?: number;
    sort?: string;
  }): Promise<PaginatedResponse<CourseSerializer>> {
    const {
      skip,
      limit,
      categoryId,
      level,
      search,
      minPrice,
      maxPrice,
      minRating,
      maxDuration,
      sort,
    } = filterDto;

    // Map the storefront's sort option to a Mongo sort spec.
    const sortMap: Record<string, Record<string, 1 | -1>> = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      'price-asc': { price: 1 },
      'price-desc': { price: -1 },
      rating: { ratingAverage: -1 },
      popular: { totalEnrollments: -1 },
    };
    const sortSpec = sortMap[sort ?? ''] ?? { createdAt: -1 };

    let categoryIdObj;
    if (categoryId) {
      try {
        const category = await this.categoryModel.findById(categoryId).exec();
        if (category) {
          categoryIdObj = category._id;
        } else {
          return {
            data: [],
            meta: {
              total: 0,
              page: 1,
              limit,
              totalPages: 0,
              hasNextPage: false,
              hasPrevPage: false,
            },
          };
        }
      } catch (error) {
        return {
          data: [],
          meta: {
            total: 0,
            page: 1,
            limit,
            totalPages: 0,
            hasNextPage: false,
            hasPrevPage: false,
          },
        };
      }
    }

    const query: Record<string, unknown> = {
      courseStatus: CourseStatus.PUBLISHED,
      ...(categoryIdObj && { categoryId: categoryIdObj }),
      ...(level && { level }),
      ...(search && {
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
        ],
      }),
      ...((minPrice !== undefined || maxPrice !== undefined) && {
        price: {
          ...(minPrice !== undefined && { $gte: minPrice }),
          ...(maxPrice !== undefined && { $lte: maxPrice }),
        },
      }),
      ...(minRating !== undefined && { ratingAverage: { $gte: minRating } }),
      ...(maxDuration !== undefined && { totalHours: { $lte: maxDuration } }),
    };

    const [data, total] = await Promise.all([
      this.courseModel
        .find(query)
        .select('-sections -description -requirements -goals')
        .sort(sortSpec)
        .skip(skip)
        .limit(limit)
        .populate('instructorId', 'firstName lastName email avatar')
        .populate('categoryId', 'name')
        .exec(),
      this.courseModel.countDocuments(query),
    ]);

    const page = Math.floor(skip / limit) + 1;
    const totalPages = Math.ceil(total / limit);

    return {
      data: data.map((d) => new CourseSerializer(d.toObject())),
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

  async findInstructorCourses(
    instructorId: string,
  ): Promise<CourseSerializer[]> {
    if (!instructorId) return [];
    // The instructor course-list view only renders card metadata, so exclude
    // the heavy embedded sections/lessons tree from the payload.
    const courses = await this.courseModel
      .find({ instructorId: new Types.ObjectId(instructorId) })
      .select('-sections')
      .sort({ createdAt: -1 })
      .exec();
    return courses.map((c) => new CourseSerializer(c.toObject()));
  }

  async findByInstructor(
    instructorId: string,
    filterDto: Record<string, unknown>,
  ) {
    const status = filterDto.status as string | undefined;
    const page = (filterDto.page as number) || 1;
    const limit = (filterDto.limit as number) || 10;
    const query: Record<string, unknown> = {
      instructorId: new Types.ObjectId(instructorId),
    };
    if (status) query.courseStatus = status;

    const skip = (page - 1) * limit;

    const [courses, total] = await Promise.all([
      this.courseModel
        .find(query)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.courseModel.countDocuments(query),
    ]);

    // Batch the per-course stats into two grouped aggregations instead of
    // running three queries per course (the previous N+1). Each student can
    // only have one enrollment per course (unique {studentId, courseId} index),
    // so the enrollment doc count equals the distinct-student count.
    const courseIds = courses.map((c) => c._id);

    const [enrollmentStats, revenueStats] = await Promise.all([
      this.enrollmentModel.aggregate<{
        _id: Types.ObjectId;
        totalStudents: number;
        completedCount: number;
      }>([
        { $match: { courseId: { $in: courseIds } } },
        {
          $group: {
            _id: '$courseId',
            totalStudents: { $sum: 1 },
            completedCount: {
              $sum: { $cond: ['$isCourseCompleted', 1, 0] },
            },
          },
        },
      ]),
      this.earningModel.aggregate<{ _id: Types.ObjectId; total: number }>([
        { $match: { courseId: { $in: courseIds } } },
        { $group: { _id: '$courseId', total: { $sum: '$amount' } } },
      ]),
    ]);

    const enrollmentByCourse = new Map(
      enrollmentStats.map((s) => [s._id.toString(), s]),
    );
    const revenueByCourse = new Map(
      revenueStats.map((s) => [s._id.toString(), s.total]),
    );

    const data = courses.map((c) => {
      const stats = enrollmentByCourse.get(c._id.toString());
      const totalStudents = stats?.totalStudents || 0;
      const completedCount = stats?.completedCount || 0;
      const totalRevenue = revenueByCourse.get(c._id.toString()) || 0;
      const completionRate =
        totalStudents > 0
          ? Math.round((completedCount / totalStudents) * 100)
          : 0;

      return {
        id: c._id.toString(),
        title: c.title,
        thumbnail: c.thumbnail,
        status: c.courseStatus,
        totalStudents,
        totalRevenue,
        rating: c.ratingAverage || 0,
        completionRate,
      };
    });

    const totalPages = Math.ceil(total / limit);

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

  async getRejectionReason(courseId: string, instructorId: string) {
    const course = await this.courseModel
      .findById(courseId)
      .populate('rejectedBy', 'firstName lastName')
      .exec();
    if (!course) throw new NotFoundException('Course not found');

    // OWNERSHIP CHECK ENFORCED: verifies course belongs to the requesting instructor
    if (course.instructorId.toString() !== instructorId) {
      throw new ForbiddenException('You do not own this course');
    }

    if (course.courseStatus !== 'rejected') {
      throw new BadRequestException('This course is not in rejected status');
    }

    const rejectedBy = course.rejectedBy as unknown as {
      firstName: string;
      lastName: string;
    };

    return {
      courseId: course._id.toString(),
      courseTitle: course.title,
      status: course.courseStatus,
      rejectionReason: course.rejectionReason || 'No reason provided',
      rejectedBy: rejectedBy
        ? `${rejectedBy.firstName} ${rejectedBy.lastName}`
        : 'System',
      rejectedAt: (course as any).rejectedAt || new Date(),
    };
  }

  async findCourseDocument(id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('Invalid ID');

    const course = await this.courseModel
      .findById(id)
      .populate('instructorId', 'firstName lastName bio avatar email')
      .populate('categoryId', 'name')
      .exec();

    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  async findOne(id: string): Promise<CourseSerializer> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('Invalid ID');

    // Dynamically calculate the latest totalHours and totalLessons
    await this.syncMetadata(id);

    const course = await this.findCourseDocument(id);
    return new CourseSerializer(course.toObject());
  }

  async update(
    id: string,
    instructorId: string,
    dto: UpdateCourseDto,
  ): Promise<CourseSerializer> {
    const updated = await this.courseModel.findOneAndUpdate(
      { _id: id, instructorId: new Types.ObjectId(instructorId) },
      { $set: dto },
      { returnDocument: 'after', runValidators: true },
    );
    if (!updated) throw new ForbiddenException('Not authorized');
    return new CourseSerializer(updated.toObject());
  }

  async remove(id: string): Promise<{ message: string }> {
    const result = await this.courseModel.findByIdAndDelete(id);
    if (!result) throw new NotFoundException('Course not found');
    return { message: 'Course successfully deleted' };
  }

  async syncMetadata(courseId: string) {
    const result = await this.courseModel.aggregate([
      { $match: { _id: new Types.ObjectId(courseId) } },

      // Step 1: Unwind the sections once so we can see them
      { $unwind: { path: '$sections', preserveNullAndEmptyArrays: true } },

      // Step 2: Use $facet to run two separate calculations simultaneously!
      {
        $facet: {
          // Calculation A: Safe Price Summation (Sections only)
          priceData: [
            {
              $group: {
                _id: '$_id',
                totalPrice: { $sum: { $ifNull: ['$sections.price', 0] } },
              },
            },
          ],

          // Calculation B: Lessons and Hours (Requires unwinding lessons)
          videoData: [
            {
              $unwind: {
                path: '$sections.lessons',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $group: {
                _id: '$_id',
                totalLessons: {
                  $sum: {
                    $cond: [
                      { $ifNull: ['$sections.lessons._id', false] },
                      1,
                      0,
                    ],
                  },
                },
                totalDurationSeconds: {
                  $sum: { $ifNull: ['$sections.lessons.videoDuration', 0] },
                },
              },
            },
          ],
        },
      },
    ]);

    if (!result || result.length === 0) return;

    // Extract the calculated data
    const priceStats = result[0].priceData[0] || { totalPrice: 0 };
    const videoStats = result[0].videoData[0] || {
      totalLessons: 0,
      totalDurationSeconds: 0,
    };

    const totalHours = Number(
      ((videoStats.totalDurationSeconds || 0) / 3600).toFixed(2),
    );

    // Update the course with the new pricing and metadata
    await this.courseModel.updateOne(
      { _id: new Types.ObjectId(courseId) },
      {
        $set: {
          price: priceStats.totalPrice,
          totalLessons: videoStats.totalLessons,
          totalHours: totalHours,
        },
      },
    );
  }

  async getInstructorStats(instructorId: string) {
    const result = await this.courseModel.aggregate<{
      courseData: {
        totalCourses: number;
        publishedCourses: number;
        totalLessons: number;
      }[];
    }>([
      {
        $match: { instructorId: new Types.ObjectId(instructorId) },
      },
      {
        $facet: {
          courseData: [
            {
              $group: {
                _id: null,
                totalCourses: { $sum: 1 },
                publishedCourses: {
                  $sum: {
                    $cond: [
                      { $eq: ['$courseStatus', CourseStatus.PUBLISHED] },
                      1,
                      0,
                    ],
                  },
                },
                // Since syncMetadata saves totalLessons at the root, we can just sum it here instantly!
                totalLessons: { $sum: { $ifNull: ['$totalLessons', 0] } },
              },
            },
          ],
        },
      },
    ]);

    const aggregateStats = result && result.length > 0 ? result[0] : null;
    const courseStats = aggregateStats?.courseData?.[0] || {
      totalCourses: 0,
      publishedCourses: 0,
      totalLessons: 0,
    };

    // Return the EXACT interface required by your Angular UI
    // We dynamically calculate courses/lessons, but mock the financial data until the Payment phase.
    return {
      stats: {
        totalCourses: courseStats.totalCourses,
        publishedCourses: courseStats.publishedCourses,
        totalLessons: courseStats.totalLessons,
        totalEarnings: 12450.0,
        earningsGrowth: 14,
        pendingPayouts: 1200.0,
        nextPayoutDate: '2023-10-15T00:00:00.000Z',
        totalStudents: 1420,
        studentsGrowth: 52,
      },
      revenueChart: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        data: [1200, 1900, 3000, 5000, 2000, 3000],
      },
      recentSales: [
        {
          id: '1',
          studentName: 'John Doe',
          courseTitle: 'Advanced Angular',
          itemType: 'course' as 'course' | 'section',
          date: new Date().toISOString(),
          price: 49.99,
          status: 'COMPLETED' as 'COMPLETED' | 'REFUNDED',
        },
        {
          id: '2',
          studentName: 'Jane Smith',
          courseTitle: 'NestJS Microservices',
          itemType: 'section' as 'course' | 'section',
          sectionTitle: 'Building GraphQL APIs',
          date: new Date().toISOString(),
          price: 19.99,
          status: 'COMPLETED' as 'COMPLETED' | 'REFUNDED',
        },
      ],
    };
  }

  async submitForReview(courseId: string, instructorId: string) {
    const course = await this.courseModel
      .findOne({
        _id: new Types.ObjectId(courseId),
        instructorId: new Types.ObjectId(instructorId),
      })
      .exec();

    if (!course)
      throw new NotFoundException('Course not found or unauthorized');

    // 1. Validation: Details
    if (!course.title || course.title.trim() === '')
      throw new BadRequestException(
        'Course title is required before publishing.',
      );
    if (!course.description || course.description.trim() === '')
      throw new BadRequestException(
        'Course description is required before publishing.',
      );
    if (course.price === undefined || course.price < 0)
      throw new BadRequestException(
        'Course price must be set (can be 0 for free).',
      );
    if (!course.thumbnail || course.thumbnail.trim() === '')
      throw new BadRequestException('Course thumbnail is required.');

    // 2. Validation: Content (Must have at least one section)
    if (!course.sections || course.sections.length === 0) {
      throw new BadRequestException(
        'Course must have at least one section before publishing.',
      );
    }

    // 3. Validation: Videos (Must have at least one lesson with a video)
    let hasVideo = false;
    for (const section of course.sections) {
      if (section.lessons && section.lessons.length > 0) {
        for (const lesson of section.lessons) {
          if (lesson.videoUrl && lesson.videoUrl.trim() !== '') {
            hasVideo = true;
            break;
          }
        }
      }
      if (hasVideo) break;
    }

    if (!hasVideo) {
      throw new BadRequestException(
        'Course must contain at least one lesson with a valid video URL.',
      );
    }

    // Pass: Change Status
    course.courseStatus = CourseStatus.UNDER_REVIEW;
    await course.save();

    // Notify all admins & superadmins in real time
    try {
      const admins = await this.userModel
        .find({ role: { $in: [UserRole.ADMIN, UserRole.SUPERADMIN] } })
        .select('_id')
        .lean()
        .exec();

      console.log(`📣 Notifying ${admins.length} admin(s) about course submission: ${course.title}`);

      await Promise.all(
        admins.map((admin) =>
          this.notificationsService.create(
            admin._id as Types.ObjectId,
            'New Course Submitted',
            `Instructor submitted course: ${course.title} for review`,
            NotificationType.COURSE_SUBMITTED_FOR_REVIEW,
            course._id.toString(),
          ),
        ),
      );

      console.log('✅ Admin notifications sent successfully');
    } catch (err) {
      // Don't let notification failure break the submission response
      console.error('❌ Failed to send admin notifications:', err);
    }

    return new CourseSerializer(course.toObject());
  }

  async getPendingReview() {
    const courses = await this.courseModel
      .find({ courseStatus: CourseStatus.UNDER_REVIEW })
      .populate('instructorId', 'firstName lastName avatar email')
      .populate('categoryId', 'name')
      .lean()
      .exec();
    return courses.map((course: unknown) => {
      const c = course as any;
      return {
        _id: c._id.toString(),
        title: c.title,
        description: c.description,
        thumbnail: c.thumbnail,
        level: c.level,
        price: c.price,
        courseStatus: c.courseStatus,
        totalHours: c.totalHours,
        totalLessons: c.totalLessons,
        sectionsCount: c.sections ? c.sections.length : 0,
        goals: c.goals,
        requirements: c.requirements,
        createdAt: c.createdAt,
        category: c.categoryId
          ? {
              _id: c.categoryId._id?.toString() || c.categoryId.toString(),
              name: c.categoryId.name,
            }
          : null,
        instructor: c.instructorId
          ? {
              _id: c.instructorId._id?.toString() || c.instructorId.toString(),
              firstName: c.instructorId.firstName,
              lastName: c.instructorId.lastName,
              avatar: c.instructorId.avatar,
              email: c.instructorId.email,
            }
          : null,
      };
    });
  }

  async getAdminStats() {
    const stats = await this.courseModel.aggregate([
      {
        $group: {
          _id: '$courseStatus',
          count: { $sum: 1 },
        },
      },
    ]);

    const result = {
      totalCourses: 0,
      underReview: 0,
      published: 0,
      rejected: 0,
      draft: 0,
    };

    stats.forEach((stat) => {
      result.totalCourses += stat.count;
      if (stat._id === CourseStatus.UNDER_REVIEW)
        result.underReview = stat.count;
      else if (stat._id === CourseStatus.PUBLISHED)
        result.published = stat.count;
      else if (stat._id === CourseStatus.REJECTED) result.rejected = stat.count;
      else if (stat._id === CourseStatus.DRAFT) result.draft = stat.count;
    });

    return result;
  }

  async approveCourse(courseId: string) {
    const course = await this.courseModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(courseId),
        courseStatus: CourseStatus.UNDER_REVIEW,
      },
      { $set: { courseStatus: CourseStatus.PUBLISHED } },
      { returnDocument: 'after', runValidators: true },
    );
    if (!course)
      throw new NotFoundException('Course not found or not under review.');
    return new CourseSerializer(course.toObject());
  }

  async rejectCourse(courseId: string, reason?: string) {
    const course = await this.courseModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(courseId),
        courseStatus: CourseStatus.UNDER_REVIEW,
      },
      {
        $set: {
          courseStatus: CourseStatus.REJECTED,
          ...(reason && { rejectionReason: reason }),
        },
      },
      { returnDocument: 'after', runValidators: true },
    );
    if (!course)
      throw new NotFoundException('Course not found or not under review.');
    return new CourseSerializer(course.toObject());
  }

  async getResumePoint(courseId: string, studentId: string) {
    const enrollment = await this.enrollmentModel.findOne({
      studentId: new Types.ObjectId(studentId),
      courseId: new Types.ObjectId(courseId),
    });

    if (!enrollment) {
      throw new ForbiddenException('You are not enrolled in this course');
    }

    const progress = await this.progressModel
      .findOne(
        {
          studentId: new Types.ObjectId(studentId),
          courseId: new Types.ObjectId(courseId),
          isCompleted: false,
        },
        {},
        { sort: { lastWatchedAt: -1 } },
      )
      .exec();

    if (progress) {
      const lessonObjId = progress.lessonId;
      const course = await this.courseModel.findOne(
        {
          _id: new Types.ObjectId(courseId),
          'sections.lessons._id': lessonObjId,
        },
        { 'sections.$': 1 },
      );
      let sectionId = '';
      if (course && course.sections && course.sections.length > 0) {
        sectionId = course.sections[0]._id.toString();
      }

      return {
        lessonId: progress.lessonId.toString(),
        sectionId: sectionId,
        watchedDuration: progress.watchedDuration || 0,
      };
    }

    // No progress record, find the first lesson of the first section
    const course = await this.courseModel.findById(courseId).exec();
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    let firstSectionId = null;
    let firstLessonId = null;

    for (const section of course.sections) {
      if (section.lessons && section.lessons.length > 0) {
        firstSectionId = section._id.toString();
        firstLessonId = section.lessons[0]._id.toString();
        break;
      }
    }

    if (!firstLessonId || !firstSectionId) {
      throw new NotFoundException('Course has no lessons');
    }

    return {
      lessonId: firstLessonId,
      sectionId: firstSectionId,
      watchedDuration: 0,
    };
  }
}
