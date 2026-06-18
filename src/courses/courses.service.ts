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
import { CourseSerializer } from './serializers/course.serializer';
import { PaginatedResponse } from '../common/interfaces/paginated-response.interface';

@Injectable()
export class CoursesService {
  constructor(
    @InjectModel(Course.name) private readonly courseModel: Model<Course>,
    @InjectModel(Category.name) private readonly categoryModel: Model<Category>,
  ) { }

  async create(dto: CreateCourseDto, instructorId: string): Promise<CourseSerializer> {
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
    categorySlug?: string;
    level?: string;
    search?: string;
    minPrice?: number;
    maxPrice?: number;
  }): Promise<PaginatedResponse<CourseSerializer>> {
    const {
      skip,
      limit,
      categorySlug,
      level,
      search,
      minPrice,
      maxPrice,
    } = filterDto;

    let categoryIdObj;
    if (categorySlug) {
      const category = await this.categoryModel.findOne({ slug: categorySlug }).exec();
      if (category) {
        categoryIdObj = category._id;
      } else {
        return { data: [], meta: { total: 0, page: 1, limit, totalPages: 0, hasNextPage: false, hasPrevPage: false } };
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
      }
    };
  }

  async findInstructorCourses(instructorId: string): Promise<CourseSerializer[]> {
    if (!instructorId) return [];
    const courses = await this.courseModel
      .find({ instructorId: new Types.ObjectId(instructorId) })
      .sort({ createdAt: -1 })
      .exec();
    return courses.map((c) => new CourseSerializer(c.toObject()));
  }

  async findOne(id: string): Promise<CourseSerializer> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('Invalid ID');

    // Dynamically calculate the latest totalHours and totalLessons
    await this.syncMetadata(id);

    const course = await this.courseModel
      .findById(id)
      .populate('instructorId', 'firstName lastName bio avatar')
      .populate('categoryId', 'name slug')
      .exec();

    if (!course) throw new NotFoundException('Course not found');
    return new CourseSerializer(course.toObject());
  }

  async update(id: string, instructorId: string, dto: UpdateCourseDto): Promise<CourseSerializer> {
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
                totalPrice: { $sum: { $ifNull: ['$sections.price', 0] } }
              }
            }
          ],

          // Calculation B: Lessons and Hours (Requires unwinding lessons)
          videoData: [
            { $unwind: { path: '$sections.lessons', preserveNullAndEmptyArrays: true } },
            {
              $group: {
                _id: '$_id',
                totalLessons: {
                  $sum: { $cond: [{ $ifNull: ['$sections.lessons._id', false] }, 1, 0] }
                },
                totalDurationSeconds: { $sum: { $ifNull: ['$sections.lessons.videoDuration', 0] } }
              }
            }
          ]
        }
      }
    ]);

    if (!result || result.length === 0) return;

    // Extract the calculated data
    const priceStats = result[0].priceData[0] || { totalPrice: 0 };
    const videoStats = result[0].videoData[0] || { totalLessons: 0, totalDurationSeconds: 0 };

    const totalHours = Number(((videoStats.totalDurationSeconds || 0) / 3600).toFixed(2));

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
          itemType: 'course',
          date: new Date().toISOString(),
          price: 49.99,
          status: 'COMPLETED',
        },
        {
          id: '2',
          studentName: 'Jane Smith',
          courseTitle: 'NestJS Microservices',
          itemType: 'section',
          sectionTitle: 'Building GraphQL APIs',
          date: new Date().toISOString(),
          price: 19.99,
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

    return new CourseSerializer(course.toObject());
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
    return new CourseSerializer(course.toObject());
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
    return new CourseSerializer(course.toObject());
  }
}
