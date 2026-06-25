import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '../users/schema/user.schema';
import { Course } from '../courses/schema/course.schema';
import { Earning } from '../orders/schema/earning.schema';
import { Enrollment } from '../enrollments/schema/enrollment.schema';
import { Review } from '../reviews/schema/review.schema';
import { UserRole } from '../common/enums/user-role.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';

/**
 * Instructor Summary Cron Service
 * Sends automated weekly and monthly performance summaries to instructors.
 * 
 * CRON Schedule:
 * - Weekly: Every Monday at 6:00 AM
 * - Monthly: 1st of every month at 6:00 AM
 */
@Injectable()
export class InstructorSummaryService {
  private readonly logger = new Logger(InstructorSummaryService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Course.name) private courseModel: Model<Course>,
    @InjectModel(Earning.name) private earningModel: Model<Earning>,
    @InjectModel(Enrollment.name) private enrollmentModel: Model<Enrollment>,
    @InjectModel(Review.name) private reviewModel: Model<Review>,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Weekly summary - runs every Monday at 6:00 AM
   * Covers the past 7 days
   */
  @Cron('0 6 * * 1')
  async sendWeeklySummaries(): Promise<void> {
    this.logger.log('Starting weekly instructor summary job...');
    
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - 7);
    periodStart.setHours(0, 0, 0, 0);

    await this.sendSummaries(periodStart, 'weekly');
    
    this.logger.log('Weekly instructor summary job completed.');
  }

  /**
   * Monthly summary - runs on the 1st of every month at 6:00 AM
   * Covers the past calendar month
   */
  @Cron('0 6 1 * *')
  async sendMonthlySummaries(): Promise<void> {
    this.logger.log('Starting monthly instructor summary job...');
    
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);

    await this.sendSummaries(periodStart, 'monthly');
    
    this.logger.log('Monthly instructor summary job completed.');
  }

  /**
   * Main method to send summaries to all instructors
   * @param periodStart - Start date of the period to analyze
   * @param periodType - 'weekly' or 'monthly' (for message wording)
   */
  private async sendSummaries(periodStart: Date, periodType: 'weekly' | 'monthly'): Promise<void> {
    // 1. Fetch all instructors
    const instructors = await this.userModel
      .find({ role: UserRole.INSTRUCTOR })
      .select('_id')
      .exec();

    this.logger.log(`Found ${instructors.length} instructors to process.`);

    // 2. Process each instructor
    for (const instructor of instructors) {
      try {
        await this.sendInstructorSummary(instructor._id as Types.ObjectId, periodStart, periodType);
      } catch (error) {
        this.logger.error(
          `Failed to send ${periodType} summary to instructor ${instructor._id}:`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  /**
   * Send a summary notification to a single instructor
   * @param instructorId - The instructor's user ID
   * @param periodStart - Start date of the period
   * @param periodType - 'weekly' or 'monthly'
   */
  private async sendInstructorSummary(
    instructorId: Types.ObjectId,
    periodStart: Date,
    periodType: 'weekly' | 'monthly',
  ): Promise<void> {
    // Get all course IDs for this instructor
    const courses = await this.courseModel
      .find({ instructorId })
      .select('_id')
      .exec();
    
    const courseIds = courses.map(c => c._id);
    
    if (courseIds.length === 0) {
      this.logger.debug(`Instructor ${instructorId} has no courses, skipping.`);
      return;
    }

    // 3. Count new enrollments in the period
    const enrollmentCount = await this.enrollmentModel
      .countDocuments({
        courseId: { $in: courseIds },
        createdAt: { $gte: periodStart },
      })
      .exec();

    // 4. Sum earnings in the period
    const earningsResult = await this.earningModel
      .aggregate([
        {
          $match: {
            instructorId,
            createdAt: { $gte: periodStart },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' },
          },
        },
      ])
      .exec();

    const totalEarnings = earningsResult[0]?.total || 0;

    // 5. Count new reviews in the period
    const reviewCount = await this.reviewModel
      .countDocuments({
        courseId: { $in: courseIds },
        createdAt: { $gte: periodStart },
      })
      .exec();

    // 6. Skip if all metrics are zero (don't spam with empty summaries)
    if (enrollmentCount === 0 && totalEarnings === 0 && reviewCount === 0) {
      this.logger.debug(
        `Instructor ${instructorId} has zero activity for ${periodType} period, skipping notification.`,
      );
      return;
    }

    // 7. Create the notification
    const title = periodType === 'weekly' ? 'Your Weekly Summary' : 'Your Monthly Summary';
    const periodWord = periodType === 'weekly' ? 'This week' : 'This month';
    const message = `${periodWord} you had ${enrollmentCount} new enrollments, earned ${totalEarnings.toFixed(2)} EGP, and received ${reviewCount} new reviews. Keep it up!`;

    const notificationType = periodType === 'weekly' 
      ? NotificationType.WEEKLY_SUMMARY 
      : NotificationType.MONTHLY_SUMMARY;

    await this.notificationsService.create(
      instructorId,
      title,
      message,
      notificationType,
    );

    this.logger.log(
      `Sent ${periodType} summary to instructor ${instructorId}: ` +
      `${enrollmentCount} enrollments, ${totalEarnings} EGP, ${reviewCount} reviews`,
    );
  }

  // ============================================================
  // TESTING ENDPOINTS - Remove after testing is complete
  // ============================================================

  /**
   * Manual trigger for weekly summaries (for testing)
   * POST /instructor/summary/test-weekly
   */
  async testSendWeeklySummaries(): Promise<{ message: string; count: number }> {
    this.logger.log('Manual trigger: Testing weekly summaries...');
    
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - 7);
    periodStart.setHours(0, 0, 0, 0);

    const instructors = await this.userModel
      .find({ role: UserRole.INSTRUCTOR })
      .select('_id')
      .exec();

    let notificationCount = 0;
    for (const instructor of instructors) {
      try {
        await this.sendInstructorSummary(instructor._id as Types.ObjectId, periodStart, 'weekly');
        notificationCount++;
      } catch (error) {
        this.logger.error(
          `Failed to send weekly summary to instructor ${instructor._id}:`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return { 
      message: `Weekly summary test completed. Notifications sent to ${notificationCount} instructors.`, 
      count: notificationCount 
    };
  }

  /**
   * Manual trigger for monthly summaries (for testing)
   * POST /instructor/summary/test-monthly
   */
  async testSendMonthlySummaries(): Promise<{ message: string; count: number }> {
    this.logger.log('Manual trigger: Testing monthly summaries...');
    
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);

    const instructors = await this.userModel
      .find({ role: UserRole.INSTRUCTOR })
      .select('_id')
      .exec();

    let notificationCount = 0;
    for (const instructor of instructors) {
      try {
        await this.sendInstructorSummary(instructor._id as Types.ObjectId, periodStart, 'monthly');
        notificationCount++;
      } catch (error) {
        this.logger.error(
          `Failed to send monthly summary to instructor ${instructor._id}:`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return { 
      message: `Monthly summary test completed. Notifications sent to ${notificationCount} instructors.`, 
      count: notificationCount 
    };
  }
}