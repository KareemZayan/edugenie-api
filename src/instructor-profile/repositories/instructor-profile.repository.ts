import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { Course } from '../../courses/schemas/course.schema';
import { CourseStatus } from '../../courses/enums/status.enum';

@Injectable()
export class InstructorProfileRepository {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Course.name) private readonly courseModel: Model<Course>,
  ) {}

  async findUserById(id: string): Promise<User | null> {
    return this.userModel.findById(id).exec();
  }

  async updateUserById(id: string, updateData: Partial<User>): Promise<User | null> {
    // If name is provided, we should update firstName and lastName
    // We expect the mapper/service to handle it or we can handle it here if it's passed as such
    return this.userModel.findByIdAndUpdate(id, updateData, { new: true }).exec();
  }

  async incrementProfileViews(id: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(id, { $inc: { profileViews: 1 } }).exec();
  }

  async getInstructorStats(instructorId: string): Promise<any> {
    const objectId = new Types.ObjectId(instructorId);

    const statsPipeline = [
      { $match: { instructorId: objectId } },
      {
        $lookup: {
          from: 'enrollments', // Assumes collection name is 'enrollments'
          localField: '_id',
          foreignField: 'courseId',
          as: 'enrollmentsData',
        },
      },
      {
        $lookup: {
          from: 'ratings', // Assumes collection name is 'ratings'
          localField: '_id',
          foreignField: 'courseId',
          as: 'ratingsData',
        },
      },
      {
        $facet: {
          courseStats: [
            {
              $group: {
                _id: null,
                totalCourses: { $sum: 1 },
                publishedCourses: {
                  $sum: { $cond: [{ $eq: ['$courseStatus', CourseStatus.PUBLISHED] }, 1, 0] },
                },
                draftCourses: {
                  $sum: { $cond: [{ $eq: ['$courseStatus', CourseStatus.DRAFT] }, 1, 0] },
                },
                archivedCourses: {
                  $sum: { $cond: [{ $eq: ['$courseStatus', CourseStatus.ARCHIVED] }, 1, 0] },
                },
              },
            },
          ],
          enrollmentStats: [
            { $unwind: '$enrollmentsData' },
            {
              $group: {
                _id: null,
                totalEnrollments: { $sum: 1 },
                distinctStudents: { $addToSet: '$enrollmentsData.studentId' },
              },
            },
            {
              $project: {
                totalEnrollments: 1,
                totalStudents: { $size: '$distinctStudents' },
              },
            },
          ],
          ratingStats: [
            { $unwind: '$ratingsData' },
            {
              $group: {
                _id: null,
                averageRating: { $avg: '$ratingsData.rating' },
              },
            },
          ],
        },
      },
    ];

    const [result] = await this.courseModel.aggregate(statsPipeline).exec();
    
    // Also fetch profile views from the user document
    const user = await this.findUserById(instructorId);

    return {
      totalCourses: result.courseStats[0]?.totalCourses || 0,
      publishedCourses: result.courseStats[0]?.publishedCourses || 0,
      draftCourses: result.courseStats[0]?.draftCourses || 0,
      archivedCourses: result.courseStats[0]?.archivedCourses || 0,
      totalStudents: result.enrollmentStats[0]?.totalStudents || 0,
      totalEnrollments: result.enrollmentStats[0]?.totalEnrollments || 0,
      averageRating: result.ratingStats[0]?.averageRating || 0,
      profileViews: user?.profileViews || 0,
    };
  }

  async getInstructorCourses(instructorId: string, page: number, limit: number, status?: CourseStatus): Promise<any> {
    const query: any = { instructorId: new Types.ObjectId(instructorId) };
    if (status) {
      query.courseStatus = status;
    }

    const skip = (page - 1) * limit;

    const [courses, total] = await Promise.all([
      this.courseModel.find(query).skip(skip).limit(limit).exec(),
      this.courseModel.countDocuments(query).exec(),
    ]);

    return { courses, total };
  }

  async getInstructorReviews(instructorId: string, page: number, limit: number): Promise<any> {
    const objectId = new Types.ObjectId(instructorId);
    const skip = (page - 1) * limit;

    const pipeline = [
      { $match: { instructorId: objectId } },
      {
        $lookup: {
          from: 'ratings',
          localField: '_id',
          foreignField: 'courseId',
          as: 'review',
        },
      },
      { $unwind: '$review' },
      {
        $lookup: {
          from: 'users',
          localField: 'review.studentId',
          foreignField: '_id',
          as: 'student',
        },
      },
      { $unwind: '$student' },
      { $sort: { 'review.createdAt': -1 as const } },
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                _id: '$review._id',
                rating: '$review.rating',
                review: '$review.review',
                createdAt: '$review.createdAt',
                courseTitle: '$title',
                studentName: { $concat: ['$student.firstName', ' ', '$student.lastName'] },
                studentAvatar: '$student.avatar',
              },
            },
          ],
        },
      },
    ];

    const [result] = await this.courseModel.aggregate(pipeline).exec();
    const totalReviews = result.metadata[0]?.total || 0;
    const reviews = result.data || [];

    // Calculate average for these reviews (or overall)
    // The prompt says "Return averageRating, totalReviews, reviews"
    // Since we need overall average rating, we can do a quick aggregate or use what we already have
    const avgPipeline = [
      { $match: { instructorId: objectId } },
      { $lookup: { from: 'ratings', localField: '_id', foreignField: 'courseId', as: 'ratings' } },
      { $unwind: '$ratings' },
      { $group: { _id: null, avg: { $avg: '$ratings.rating' } } },
    ];
    const [avgResult] = await this.courseModel.aggregate(avgPipeline).exec();
    const averageRating = avgResult?.avg || 0;

    return { averageRating, totalReviews, reviews };
  }
}
