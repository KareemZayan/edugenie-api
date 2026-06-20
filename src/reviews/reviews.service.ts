import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Review, ReviewDocument } from './schema/review.schema';
import { Course } from '../courses/schema/course.schema';
import { Enrollment } from '../enrollments/schema/enrollment.schema';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewSerializer } from './serializers/review.serializer';
import { PaginatedResponse } from '../common/interfaces/paginated-response.interface';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name) private readonly reviewModel: Model<Review>,
    @InjectModel(Course.name) private readonly courseModel: Model<Course>,
    @InjectModel(Enrollment.name) private readonly enrollmentModel: Model<Enrollment>,
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
      data: data.map(d => new ReviewSerializer(d.toObject() as any)),
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
    return new ReviewSerializer(populatedReview.toObject() as any);
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
}
