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
  ) { }

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

    const todayEarningsAgg = await this.earningModel
      .aggregate([
        { $match: { createdAt: { $gte: today } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
      .exec();
    const todayRevenue = todayEarningsAgg.length > 0 ? todayEarningsAgg[0].total : 0;

    return {
      pendingApprovals,
      newSignupsToday,
      openReports,
      platformRevenue,
      todayRevenue,
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
            : period === AnalyticsPeriod.ONE_YEAR
              ? 365
              : 90;
      startDate = new Date();
      startDate.setDate(now.getDate() - days);
      previousStartDate = new Date();
      previousStartDate.setDate(startDate.getDate() - days);
    }

    const dateFilter = startDate ? { createdAt: { $gte: startDate } } : {};

    const totalInstructors = await this.userModel
      .countDocuments({ role: UserRole.INSTRUCTOR })
      .exec();
    const totalStudents = await this.userModel
      .countDocuments({ role: UserRole.STUDENT })
      .exec();
    const totalUsers = totalStudents + totalInstructors;
    const totalCourses = await this.courseModel
      .countDocuments({ courseStatus: CourseStatus.PUBLISHED })
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

    const topCoursesAgg = await this.earningModel
      .aggregate([
        ...(startDate ? [{ $match: { createdAt: { $gte: startDate } } }] : []),
        { $group: { _id: '$courseId', revenue: { $sum: '$amount' }, enrollments: { $sum: 1 } } },
        { $sort: { enrollments: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'courses',
            localField: '_id',
            foreignField: '_id',
            as: 'course',
          },
        },
        { $unwind: '$course' },
      ])
      .exec();

    const topCoursesMapped = topCoursesAgg.map((agg) => ({
      courseId: agg._id.toString(),
      title: agg.course.title,
      enrollments: agg.enrollments,
      revenue: agg.revenue,
    }));

    const topInstructorsAgg = await this.earningModel
      .aggregate([
        ...(startDate ? [{ $match: { createdAt: { $gte: startDate } } }] : []),
        { $group: { _id: '$instructorId', totalRevenue: { $sum: '$amount' }, totalStudents: { $sum: 1 } } },
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

    const topInstructorsPromises = topInstructorsAgg.map(async (agg) => {
      return {
        instructorId: agg._id.toString(),
        name: `${agg.instructor.firstName} ${agg.instructor.lastName}`,
        totalRevenue: agg.totalRevenue,
        totalStudents: agg.totalStudents,
      };
    });

    // ── Revenue Chart: group earnings by date buckets based on period ──────
    let revenueChartLabels: string[] = [];
    let revenueChartData: number[] = [];

    if (period === AnalyticsPeriod.SEVEN_DAYS) {
      // Group by day for the last 7 days
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const buckets: { [key: string]: number } = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        buckets[key] = 0;
        revenueChartLabels.push(dayNames[d.getDay()]);
      }
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 6);
      weekStart.setHours(0, 0, 0, 0);
      const weeklyEarnings = await this.earningModel.find({ createdAt: { $gte: weekStart } }).exec();
      for (const e of weeklyEarnings) {
        const d = new Date((e as any).createdAt);
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        if (buckets[key] !== undefined) buckets[key] += e.amount;
      }
      revenueChartData = Object.values(buckets);

    } else if (period === AnalyticsPeriod.ONE_YEAR) {
      // Group by month for the last 12 months
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const buckets: { [key: string]: number } = {};
      for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        buckets[key] = 0;
        revenueChartLabels.push(monthNames[d.getMonth()]);
      }
      const yearStart = new Date();
      yearStart.setMonth(yearStart.getMonth() - 11);
      yearStart.setDate(1);
      yearStart.setHours(0, 0, 0, 0);
      const yearlyEarnings = await this.earningModel.find({ createdAt: { $gte: yearStart } }).exec();
      for (const e of yearlyEarnings) {
        const d = new Date((e as any).createdAt);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (buckets[key] !== undefined) buckets[key] += e.amount;
      }
      revenueChartData = Object.values(buckets);

    } else {
      // Default: last 30 days — group into 10 buckets of 3 days each
      const buckets: { [key: string]: number } = {};
      const bucketLabels: string[] = [];
      for (let i = 9; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i * 3);
        const label = `${d.toLocaleString('en', { month: 'short' })} ${d.getDate()}`;
        const key = `bucket_${9 - i}`;
        buckets[key] = 0;
        bucketLabels.push(label);
      }
      revenueChartLabels = bucketLabels;
      const monthStart = new Date();
      monthStart.setDate(monthStart.getDate() - 30);
      monthStart.setHours(0, 0, 0, 0);
      const monthlyEarnings = await this.earningModel.find({ createdAt: { $gte: monthStart } }).exec();
      for (const e of monthlyEarnings) {
        const d = new Date((e as any).createdAt);
        const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
        const bucketIndex = 9 - Math.floor(diffDays / 3);
        if (bucketIndex >= 0 && bucketIndex <= 9) {
          buckets[`bucket_${bucketIndex}`] += e.amount;
        }
      }
      revenueChartData = Object.values(buckets);
    }

    return {
      totalUsers,
      totalInstructors,
      totalStudents,
      totalCourses,
      totalRevenue,
      revenueGrowthPercent,
      revenueChart: {
        labels: revenueChartLabels,
        data: revenueChartData,
      },
      topCourses: topCoursesMapped,
      topInstructors: await Promise.all(topInstructorsPromises),
    };
  }
}
