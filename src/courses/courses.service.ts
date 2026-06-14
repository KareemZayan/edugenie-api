import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Course } from './schema/course.schema';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { CourseStatus } from '../common/enums/course-status.enum';
import { Category } from '../categories/schema/category.schema';

@Injectable()
export class CoursesService {
  constructor(
    @InjectModel(Course.name) private readonly courseModel: Model<Course>,
    @InjectModel(Category.name) private readonly categoryModel: Model<Category>,
  ) {}

  async create(dto: CreateCourseDto, instructorId: string): Promise<Course> {
    if (!instructorId)
      throw new BadRequestException('Instructor ID is required');

    return await this.courseModel.create({
      ...dto,
      instructorId: new Types.ObjectId(instructorId),
      courseStatus: CourseStatus.DRAFT,
    });
  }

  async findAll(params: {
    skip: number;
    limit: number;
    categorySlug?: string;
    level?: string;
    search?: string;
    minPrice?: number;
    maxPrice?: number;
  }) {
    const { skip, limit, categorySlug, level, search, minPrice, maxPrice } = params;

    let categoryIdObj;
    if (categorySlug) {
      const category = await this.categoryModel.findOne({ slug: categorySlug }).exec();
      if (category) {
        categoryIdObj = category._id;
      } else {
        // If the category slug doesn't exist, return empty results early
        return { data: [], total: 0, skip, limit };
      }
    }

    // Senior Level: Modern ES6 Conditional Object Spread
    const query: any = {
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
    };

    const [data, total] = await Promise.all([
      this.courseModel
        .find(query)
        .skip(skip)
        .limit(limit)
        .populate('instructorId', 'firstName lastName')
        .populate('categoryId', 'name slug iconUrl')
        .exec(),
      this.courseModel.countDocuments(query),
    ]);

    return {
      data,
      total,
      skip,
      limit,
    };
  }

  async findInstructorCourses(instructorId: string) {
    if (!instructorId) return [];
    return await this.courseModel
      .find({ instructorId: new Types.ObjectId(instructorId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('Invalid ID');
    const course = await this.courseModel
      .findById(id)
      .populate('instructorId', 'name bio')
      .exec();
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  async update(id: string, instructorId: string, dto: UpdateCourseDto) {
    const updated = await this.courseModel.findOneAndUpdate(
      { _id: id, instructorId: new Types.ObjectId(instructorId) },
      { $set: dto },
      { returnDocument: 'after', runValidators: true },
    );
    if (!updated) throw new ForbiddenException('Not authorized');
    return updated;
  }

  async remove(id: string) {
    const result = await this.courseModel.findByIdAndDelete(id);
    if (!result) throw new NotFoundException('Course not found');
    return { success: true };
  }

  async syncMetadata(courseId: string) {
    // Use MongoDB Aggregation to calculate totals entirely inside the database (Super fast, zero memory overhead)
    const result = await this.courseModel.aggregate<{
      _id: Types.ObjectId;
      totalLessons: number;
      totalDurationSeconds: number;
    }>([
      { $match: { _id: new Types.ObjectId(courseId) } },
      { $unwind: '$sections' },
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
              $cond: [{ $ifNull: ['$sections.lessons._id', false] }, 1, 0],
            },
          },
          // IMPORTANT: Assuming you fixed lessons.service.ts to save `duration` in SECONDS
          totalDurationSeconds: { $sum: '$sections.lessons.duration' },
        },
      },
    ]);

    if (!result || result.length === 0) return;
    const stats = result[0];

    const totalHour = Math.round((stats.totalDurationSeconds || 0) / 3600);

    // Update the course with the new metadata
    await this.courseModel.updateOne(
      { _id: new Types.ObjectId(courseId) },
      {
        $set: {
          totalLessons: stats.totalLessons,
          totalHour: totalHour,
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
          date: new Date().toISOString(),
          price: 49.99,
          status: 'COMPLETED',
        },
        {
          id: '2',
          studentName: 'Jane Smith',
          courseTitle: 'NestJS Microservices',
          date: new Date().toISOString(),
          price: 99.99,
          status: 'COMPLETED',
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

    return {
      success: true,
      message: 'Course successfully submitted for Admin Review.',
      status: course.courseStatus,
    };
  }

  async approveCourse(courseId: string) {
    const course = await this.courseModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(courseId),
        courseStatus: CourseStatus.UNDER_REVIEW,
      },
      { $set: { courseStatus: CourseStatus.PUBLISHED } },
      { returnDocument: 'after' },
    );
    if (!course)
      throw new NotFoundException('Course not found or not under review.');
    return {
      success: true,
      message: 'Course has been approved and published.',
      status: course.courseStatus,
    };
  }

  async rejectCourse(courseId: string) {
    const course = await this.courseModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(courseId),
        courseStatus: CourseStatus.UNDER_REVIEW,
      },
      { $set: { courseStatus: CourseStatus.REJECTED } },
      { returnDocument: 'after' },
    );
    if (!course)
      throw new NotFoundException('Course not found or not under review.');
    return {
      success: true,
      message: 'Course has been rejected and returned to instructor.',
      status: course.courseStatus,
    };
  }
}
