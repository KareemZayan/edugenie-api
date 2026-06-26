import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Course, CourseDocument } from '../../courses/schema/course.schema';
import { User } from '../../users/schema/user.schema';
import { Report, ReportDocument } from '../../reports/schema/report.schema';
import { Earning, EarningDocument } from '../../earnings/schema/earning.schema';
import { CourseStatus } from '../../common/enums/course-status.enum';
import { ReportStatus } from '../../common/enums/report-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  AnalyticsPeriodQueryDto,
  AnalyticsPeriod,
} from '../dto/analytics-period-query.dto';
import {
  AdminDashboardOverviewResponse,
  PlatformAnalyticsResponse,
} from '../../common/interfaces/frontend-contracts';

@Injectable()
export class AdminAnalyticsService {
  constructor(
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Report.name) private reportModel: Model<ReportDocument>,
    @InjectModel(Earning.name) private earningModel: Model<EarningDocument>,
  ) {}

  async getDashboardOverview(): Promise<AdminDashboardOverviewResponse> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pendingApprovals = await this.courseModel
      .countDocuments({ courseStatus: CourseStatus.UNDER_REVIEW })
      .exec();
    const newSignupsToday = await this.userModel
      .countDocuments({ createdAt: { $gte: today } })
      .exec();
    const openReports = await this.reportModel
      .countDocuments({ status: ReportStatus.OPEN })
      .exec();

    const earningsAgg = await this.earningModel
      .aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }])
      .exec();
    const platformRevenue = earningsAgg.length > 0 ? earningsAgg[0].total : 0;

    return {
      pendingApprovals,
      newSignupsToday,
      openReports,
      platformRevenue,
    };
  }

  async getPlatformAnalytics(
    query: AnalyticsPeriodQueryDto,
  ): Promise<PlatformAnalyticsResponse> {
    const period = query.period || AnalyticsPeriod.THIRTY_DAYS;
    let startDate: Date | null = null;
    let previousStartDate: Date | null = null;
    const now = new Date();

    if (period !== AnalyticsPeriod.ALL) {
      const days =
        period === AnalyticsPeriod.SEVEN_DAYS
          ? 7
          : period === AnalyticsPeriod.THIRTY_DAYS
            ? 30
            : 90;
      startDate = new Date();
      startDate.setDate(now.getDate() - days);
      previousStartDate = new Date();
      previousStartDate.setDate(startDate.getDate() - days);
    }

    const dateFilter = startDate ? { createdAt: { $gte: startDate } } : {};

    const totalUsers = await this.userModel.countDocuments(dateFilter).exec();
    const totalInstructors = await this.userModel
      .countDocuments({ ...dateFilter, role: UserRole.INSTRUCTOR })
      .exec();
    const totalStudents = await this.userModel
      .countDocuments({ ...dateFilter, role: UserRole.STUDENT })
      .exec();
    const totalCourses = await this.courseModel
      .countDocuments({ ...dateFilter, courseStatus: CourseStatus.PUBLISHED })
      .exec();

    const earningsAgg = await this.earningModel
      .aggregate([
        ...(startDate ? [{ $match: { createdAt: { $gte: startDate } } }] : []),
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ])
      .exec();
    const totalRevenue = earningsAgg.length > 0 ? earningsAgg[0].total : 0;

    let revenueGrowthPercent = 0;
    if (previousStartDate && startDate) {
      const prevEarningsAgg = await this.earningModel
        .aggregate([
          {
            $match: { createdAt: { $gte: previousStartDate, $lt: startDate } },
          },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ])
        .exec();
      const prevRevenue =
        prevEarningsAgg.length > 0 ? prevEarningsAgg[0].total : 0;
      if (prevRevenue > 0) {
        revenueGrowthPercent =
          ((totalRevenue - prevRevenue) / prevRevenue) * 100;
      } else if (totalRevenue > 0) {
        revenueGrowthPercent = 100;
      }
    }

    const topCourses = await this.courseModel
      .find({ courseStatus: CourseStatus.PUBLISHED })
      .sort({ totalEnrollments: -1 })
      .limit(5)
      .exec();

    const topInstructorsAgg = await this.earningModel
      .aggregate([
        ...(startDate ? [{ $match: { createdAt: { $gte: startDate } } }] : []),
        { $group: { _id: '$instructorId', totalRevenue: { $sum: '$amount' } } },
        { $sort: { totalRevenue: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'instructor',
          },
        },
        { $unwind: '$instructor' },
      ])
      .exec();

    // To get total students per instructor, we could aggregate on Courses or Enrollments.
    // Here we will use the instructor profile stats or aggregate on courses.
    const topInstructorsPromises = topInstructorsAgg.map(async (agg) => {
      const instructorCourses = await this.courseModel
        .find({ instructorId: agg._id })
        .select('totalEnrollments')
        .exec();
      const totalStudents = instructorCourses.reduce(
        (sum, course) => sum + course.totalEnrollments,
        0,
      );
      return {
        instructorId: agg._id.toString(),
        name: `${agg.instructor.firstName} ${agg.instructor.lastName}`,
        totalRevenue: agg.totalRevenue,
        totalStudents,
      };
    });

    return {
      totalUsers,
      totalInstructors,
      totalStudents,
      totalCourses,
      totalRevenue,
      revenueGrowthPercent,
      topCourses: topCourses.map((c) => ({
        courseId: c._id.toString(),
        title: c.title,
        enrollments: c.totalEnrollments,
        revenue: c.price * c.totalEnrollments, // Approximate, ideally calculated from earnings
      })),
      topInstructors: await Promise.all(topInstructorsPromises),
    };
  }
}
