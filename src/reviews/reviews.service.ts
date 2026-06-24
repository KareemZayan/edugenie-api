import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Review, ReviewDocument } from './schema/review.schema';
import { Course } from '../courses/schema/course.schema';
import { Enrollment } from '../enrollments/schema/enrollment.schema';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewSerializer } from './serializers/review.serializer';
import { PaginatedResponse } from '../common/interfaces/paginated-response.interface';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
@Injectable()
export class ReviewsService {
 constructor(
  @InjectModel(Review.name) private readonly reviewModel: Model<Review>,
  @InjectModel(Course.name) private readonly courseModel: Model<Course>,
  @InjectModel(Enrollment.name) private readonly enrollmentModel: Model<Enrollment>,
  private readonly notificationsService: NotificationsService,
) {}

  async getCourseReviews(courseId: string, page: number, limit: number, userId?: string) {
    if (!Types.ObjectId.isValid(courseId)) {
      throw new BadRequestException('Invalid course ID');
    }

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.reviewModel
        .find({ courseId: new Types.ObjectId(courseId) })
        .populate('studentId', 'firstName lastName avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.reviewModel.countDocuments({ courseId: new Types.ObjectId(courseId) }),
    ]);

    const totalPages = Math.ceil(total / limit);

    let hasReviewed = false;
    if (userId) {
      const reviewExists = await this.reviewModel.exists({
        courseId: new Types.ObjectId(courseId),
        studentId: new Types.ObjectId(userId),
      });
      if (reviewExists) {
        hasReviewed = true;
      }
    }

    return {
      data: data.map(d => new ReviewSerializer(((d.toObject ? d.toObject() : d) as unknown) as Record<string, unknown>)),
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      hasReviewed,
    };
  }

  async createReview(studentId: string, dto: CreateReviewDto): Promise<ReviewSerializer> {
    if (!Types.ObjectId.isValid(dto.courseId)) {
      throw new BadRequestException('Invalid course ID');
    }

    // 1. Verify Enrollment
    const enrollment = await this.enrollmentModel.findOne({
      courseId: new Types.ObjectId(dto.courseId),
      studentId: new Types.ObjectId(studentId),
    }).exec();

    if (!enrollment) {
      throw new ForbiddenException('You must be enrolled in this course to write a review.');
    }

    // 2. Ensure user hasn't already reviewed
    const existingReview = await this.reviewModel.findOne({
      courseId: new Types.ObjectId(dto.courseId),
      studentId: new Types.ObjectId(studentId),
    }).exec();

    if (existingReview) {
      throw new BadRequestException('You have already reviewed this course.');
    }

    // 3. Create Review
    const newReview = await this.reviewModel.create({
      courseId: new Types.ObjectId(dto.courseId),
      studentId: new Types.ObjectId(studentId),
      rating: dto.rating,
      comment: dto.comment,
    });

    // 4. Update Course Rating Metadata
    await this.updateCourseRating(dto.courseId);
  const populatedReview = await newReview.populate('studentId', 'firstName lastName avatar');

  // 5. Fetch course to get instructorId + title
  const course = await this.courseModel
    .findById(dto.courseId)
    .select('instructorId title')
    .exec();

  if (course) {
    const student = populatedReview.studentId as unknown as {
      firstName: string;
      lastName: string;
    };
    const studentName = `${student.firstName} ${student.lastName}`;

    // NEW_REVIEW notification → instructor
    await this.notificationsService.create(
      course.instructorId,
      'New Review Posted',
      `${studentName} left a ${dto.rating}-star review on your course "${course.title}".`,
      NotificationType.NEW_REVIEW,
      dto.courseId,
    );

    // LOW_RATING notification → instructor (rating ≤ 2)
    if (dto.rating <= 2) {
      await this.notificationsService.create(
        course.instructorId,
        'Low Rating Alert',
        `Your course "${course.title}" received a ${dto.rating}-star review. Consider reviewing student feedback.`,
        NotificationType.LOW_RATING,
        dto.courseId,
      );
    }
  }
  
    return new ReviewSerializer(((populatedReview.toObject ? populatedReview.toObject() : populatedReview) as unknown) as Record<string, unknown>);
  }

  private async updateCourseRating(courseId: string) {
    const result = await this.reviewModel.aggregate([
      { $match: { courseId: new Types.ObjectId(courseId) } },
      {
        $group: {
          _id: '$courseId',
          averageRating: { $avg: '$rating' },
        },
      },
    ]);

    const averageRating = result.length > 0 ? parseFloat(result[0].averageRating.toFixed(1)) : 0;

    await this.courseModel.updateOne(
      { _id: new Types.ObjectId(courseId) },
      { $set: { ratingAverage: averageRating } }
    );
  }

  async findByInstructor(instructorId: string, filterDto: Record<string, unknown>) {
    const courseId = filterDto.courseId as string | undefined;
    const rating = filterDto.rating as number[] | undefined;
    const page = (filterDto.page as number) || 1;
    const limit = (filterDto.limit as number) || 10;
    
    let filterCourseIds: Types.ObjectId[] = [];

    if (courseId) {
      const course = await this.courseModel.findById(courseId).select('instructorId').exec();
      if (!course) throw new NotFoundException('Course not found');
      // OWNERSHIP CHECK ENFORCED
      if (course.instructorId.toString() !== instructorId) {
        throw new ForbiddenException('You do not own this course');
      }
      filterCourseIds.push(new Types.ObjectId(courseId));
    } else {
      const courses = await this.courseModel.find({ instructorId: new Types.ObjectId(instructorId) }).select('_id').exec();
      filterCourseIds = courses.map(c => c._id);
    }

    if (filterCourseIds.length === 0) {
      return { data: [], meta: { total: 0, page, limit, totalPages: 0, hasNextPage: false, hasPrevPage: false } };
    }

    const query: Record<string, unknown> = { courseId: { $in: filterCourseIds } };
    if (rating && rating.length > 0) {
      query.rating = { $in: rating };
    }

    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      this.reviewModel
        .find(query)
        .populate('studentId', 'firstName lastName')
        .populate('courseId', 'title')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.reviewModel.countDocuments(query),
    ]);

    const data = reviews.map((r) => {
      const reviewDoc = r as unknown as { _id: Types.ObjectId; courseId: { _id: Types.ObjectId; title: string }; studentId?: { firstName: string; lastName: string }; rating: number; comment: string; createdAt: Date };
      const studentName = reviewDoc.studentId ? `${reviewDoc.studentId.firstName} ${reviewDoc.studentId.lastName.charAt(0)}.` : 'Unknown Student';
      return {
        reviewId: reviewDoc._id.toString(),
        courseId: reviewDoc.courseId._id.toString(),
        courseTitle: reviewDoc.courseId.title,
        studentName,
        rating: reviewDoc.rating,
        comment: reviewDoc.comment,
        createdAt: reviewDoc.createdAt || new Date(),
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
}

