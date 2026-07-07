import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
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
import { PurchaseType } from '../common/enums/purchase-type.enum';
@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name) private readonly reviewModel: Model<Review>,
    @InjectModel(Course.name) private readonly courseModel: Model<Course>,
    @InjectModel(Enrollment.name)
    private readonly enrollmentModel: Model<Enrollment>,
    private readonly notificationsService: NotificationsService,
    
  ) {}

  async getCourseReviews(
  courseId: string,
  page: number,
  limit: number,
  userId?: string,
  sectionId?: string,   // NEW
) {
  if (!Types.ObjectId.isValid(courseId)) {
    throw new BadRequestException('Invalid course ID');
  }

  const filter: Record<string, unknown> = { courseId: new Types.ObjectId(courseId) };
  if (sectionId) {
    if (!Types.ObjectId.isValid(sectionId)) {
      throw new BadRequestException('Invalid section ID');
    }
    filter.sectionId = new Types.ObjectId(sectionId);
  }

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    this.reviewModel.find(filter).populate('studentId', 'firstName lastName avatar')
      .sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
    this.reviewModel.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / limit);

  let hasReviewed = false;
  if (userId) {
    const reviewedFilter: Record<string, unknown> = {
      courseId: new Types.ObjectId(courseId),
      studentId: new Types.ObjectId(userId),
    };
    if (sectionId) reviewedFilter.sectionId = new Types.ObjectId(sectionId);
    hasReviewed = !!(await this.reviewModel.exists(reviewedFilter));
  }
    return {
      data: data.map(
        (d) =>
          new ReviewSerializer(
            (d.toObject ? d.toObject() : d) as unknown as Record<
              string,
              unknown
            >,
          ),
      ),
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
  if (!Types.ObjectId.isValid(dto.sectionId)) {
    throw new BadRequestException('Invalid section ID');
  }

  // 1. Verify Enrollment — supports both full-course and section-only purchases
  const enrollment = await this.enrollmentModel
    .findOne({
      courseId: new Types.ObjectId(dto.courseId),
      studentId: new Types.ObjectId(studentId),
      $or: [
        { type: PurchaseType.FULL_COURSE },
        { type: PurchaseType.SECTION, sectionIds: new Types.ObjectId(dto.sectionId) },
      ],
    })
    .exec();
  if (!enrollment) {
    throw new ForbiddenException(
      'You must be enrolled in this course or have purchased this section to write a review.',
    );
  }

  // 2. Fetch course once — used for section validation AND instructor notification later
  const course = await this.courseModel
    .findById(dto.courseId)
    .select('sections instructorId title')
    .exec();
  if (!course) throw new NotFoundException('Course not found');

  const section = course.sections.id(dto.sectionId);
  if (!section) {
    throw new BadRequestException('This section does not belong to the given course.');
  }

  // 3. Ensure user hasn't already reviewed THIS SECTION
  const existingReview = await this.reviewModel
    .findOne({
      courseId: new Types.ObjectId(dto.courseId),
      sectionId: new Types.ObjectId(dto.sectionId),
      studentId: new Types.ObjectId(studentId),
    })
    .exec();
  if (existingReview) {
    throw new BadRequestException('You have already reviewed this section.');
  }

  // 4. Create Review
  const newReview = await this.reviewModel.create({
    courseId: new Types.ObjectId(dto.courseId),
    sectionId: new Types.ObjectId(dto.sectionId),
    studentId: new Types.ObjectId(studentId),
    rating: dto.rating,
    comment: dto.comment,
  });

  // 5. Update Course Rating Metadata (weighted)
  await this.updateCourseRating(dto.courseId);

  const populatedReview = await newReview.populate('studentId', 'firstName lastName avatar');

  // 6. Notifications — reuse `course` from step 2, no second fetch needed
  if (course) {
    const student = populatedReview.studentId as unknown as {
      firstName: string;
      lastName: string;
    };
    const studentName = `${student.firstName} ${student.lastName}`;

    await this.notificationsService.create(
      course.instructorId,
      'New Review Posted',
      `${studentName} left a ${dto.rating}-star review on your course "${course.title}".`,
      NotificationType.NEW_REVIEW,
      dto.courseId,
    );

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

  return new ReviewSerializer(
    (populatedReview.toObject
      ? populatedReview.toObject()
      : populatedReview) as unknown as Record<string, unknown>,
  );
}

  private async updateCourseRating(courseId: string) {
  const course = await this.courseModel.findById(courseId).select('sections').exec();
  if (!course) return;

  // Build weight-per-section from lesson count.
  // ASSUMPTION: sections with more lessons carry more weight — confirm with lead.
  const weightMap = new Map<string, number>();
  for (const section of course.sections) {
    const weight = section.lessons?.length || 1; // fallback so empty sections aren't ignored
    weightMap.set(section._id.toString(), weight);
  }

  const reviews = await this.reviewModel
    .find({ courseId: new Types.ObjectId(courseId) })
    .select('rating sectionId')
    .exec();

  let weightedSum = 0;
  let totalWeight = 0;
  for (const review of reviews) {
    const weight = weightMap.get(review.sectionId?.toString()) || 1;
    weightedSum += review.rating * weight;
    totalWeight += weight;
  }

  const averageRating = totalWeight > 0
    ? parseFloat((weightedSum / totalWeight).toFixed(1))
    : 0;

  await this.courseModel.updateOne(
    { _id: new Types.ObjectId(courseId) },
    { $set: { ratingAverage: averageRating } },
  );
}

async findByInstructor(
  instructorId: string,
  filterDto: Record<string, unknown>,
) {
  // ── Parse all params defensively — filterDto bypasses class-transformer ──
  const courseId = filterDto.courseId as string | undefined;

  // rating can arrive as "5", "1,2,3", ["1","2"], [1,2], etc.
  const rawRating = filterDto.rating;
  let rating: number[] | undefined;
  if (rawRating !== undefined && rawRating !== null && rawRating !== '') {
    const arr = Array.isArray(rawRating) ? rawRating : String(rawRating).split(',');
    rating = arr.map(Number).filter((n) => !isNaN(n) && n >= 1 && n <= 5);
    if (rating.length === 0) rating = undefined;
  }

  const search      = filterDto.search     as string  | undefined;
  const flaggedOnly = filterDto.flaggedOnly === true || filterDto.flaggedOnly === 'true';
  const sortBy      = (filterDto.sortBy    as string) || 'newest';
  const page        = Math.max(1, parseInt(String(filterDto.page  ?? 1),  10) || 1);
  const limit       = Math.min(100, Math.max(1, parseInt(String(filterDto.limit ?? 10), 10) || 10));

  try {
    let filterCourseIds: Types.ObjectId[] = [];

    if (courseId) {
      const course = await this.courseModel
        .findById(courseId)
        .select('instructorId')
        .exec();
      if (!course) throw new NotFoundException('Course not found');
      if (course.instructorId.toString() !== instructorId) {
        throw new ForbiddenException('You do not own this course');
      }
      filterCourseIds.push(new Types.ObjectId(courseId));
    } else {
      const courses = await this.courseModel
        .find({ instructorId: new Types.ObjectId(instructorId) })
        .select('_id')
        .exec();
      filterCourseIds = courses.map((c) => c._id);
    }

    if (filterCourseIds.length === 0) {
      return {
        data: [],
        meta: { total: 0, page, limit, totalPages: 0, hasNextPage: false, hasPrevPage: false },
      };
    }

    const query: Record<string, unknown> = {
      courseId: { $in: filterCourseIds },
    };

    if (rating && rating.length > 0) {
      query.rating = { $in: rating };
    }

    if (search && search.trim()) {
      const regex = { $regex: search.trim(), $options: 'i' };
      const orClauses: Record<string, unknown>[] = [{ comment: regex }];

      const matchingCourses = await this.courseModel
        .find({ _id: { $in: filterCourseIds }, title: regex })
        .select('_id')
        .exec();

      if (matchingCourses.length) {
        orClauses.push({ courseId: { $in: matchingCourses.map((c) => c._id) } });
      }

      query.$or = orClauses;
    }

    if (flaggedOnly) {
      query.isFlagged = true;
    }

    const skip = (page - 1) * limit;

    const sortMap: Record<string, Record<string, 1 | -1>> = {
      newest:      { createdAt: -1 },
      oldest:      { createdAt:  1 },
      rating_high: { rating: -1, createdAt: -1 },
      rating_low:  { rating:  1, createdAt: -1 },
    };
    const sort = sortMap[sortBy] ?? { createdAt: -1 };

    const [reviews, total] = await Promise.all([
      this.reviewModel
        .find(query)
        .populate('studentId', 'firstName lastName avatar')
        .populate('courseId', 'title')
        .skip(skip)
        .limit(limit)
        .sort(sort)
        .lean()           // plain JS objects — avoids Mongoose subdoc serialisation crash
        .exec(),
      this.reviewModel.countDocuments(query),
    ]);

    // Batch-fetch sections for all distinct courses on this page
    const distinctCourseIds = [
      ...new Set(
        reviews
          .map((r: any) => r.courseId?._id?.toString() ?? r.courseId?.toString())
          .filter(Boolean),
      ),
    ];

    const courseDocs = distinctCourseIds.length
      ? await this.courseModel
          .find({ _id: { $in: distinctCourseIds } })
          .select('sections')
          .lean()
          .exec()
      : [];

    const sectionMap = new Map<string, string>(); // "courseId:sectionId" → title
    for (const course of courseDocs as any[]) {
      for (const sec of course.sections ?? []) {
        sectionMap.set(`${course._id}:${sec._id}`, sec.title ?? '');
      }
    }

    const data = reviews.map((r: any) => {
      // After .lean() + .populate(), courseId is the populated doc object
      const courseDoc   = r.courseId as { _id: Types.ObjectId; title: string } | Types.ObjectId | null;
      const courseObjId = courseDoc && typeof courseDoc === 'object' && '_id' in courseDoc
        ? (courseDoc as any)._id
        : courseDoc;
      const courseTitle = courseDoc && typeof courseDoc === 'object' && 'title' in courseDoc
        ? (courseDoc as any).title
        : '';
      const studentDoc  = r.studentId as { firstName?: string; lastName?: string; avatar?: string } | null;
      const studentName = studentDoc
        ? `${studentDoc.firstName ?? ''} ${(studentDoc.lastName ?? '').charAt(0)}.`.trim()
        : 'Unknown Student';
      const studentAvatar = studentDoc?.avatar ?? null;
      const sectionTitle  = sectionMap.get(`${courseObjId}:${r.sectionId}`) ?? null;

      return {
        reviewId:    r._id.toString(),
        courseId:    courseObjId?.toString() ?? '',
        courseTitle,
        sectionTitle,
        studentName,
        studentAvatar,
        rating:      r.rating,
        comment:     r.comment,
        isFlagged:   r.isFlagged ?? false,
        flagReason:  r.flagReason ?? null,
        createdAt:   r.createdAt || new Date(),
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
  } catch (err) {
    // Re-throw NestJS HTTP exceptions unchanged; log and wrap everything else
    if (
      err instanceof NotFoundException ||
      err instanceof ForbiddenException ||
      err instanceof BadRequestException
    ) {
      throw err;
    }
    console.error('[findByInstructor] Unexpected error:', err);
    throw err;
  }
}

}