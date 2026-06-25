import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Enrollment, EnrollmentDocument } from './schema/enrollment.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';

@Injectable()
export class EnrollmentsCronService {
  private readonly logger = new Logger(EnrollmentsCronService.name);

  constructor(
    @InjectModel(Enrollment.name)
    private readonly enrollmentModel: Model<EnrollmentDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron('0 9 * * 1')
  // @Cron(CronExpression.EVERY_30_SECONDS)
  async checkInactiveEnrollments(): Promise<void> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const staleEnrollments = await this.enrollmentModel
      .find({
        isCourseCompleted: false,
        lastActivityAt: { $lt: sevenDaysAgo },
        $or: [
          { lastInactivityNotifiedAt: null },
          { lastInactivityNotifiedAt: { $lt: sevenDaysAgo } },
        ],
      })
      .populate('courseId', 'title')
      .exec();

    this.logger.log(
      `Found ${staleEnrollments.length} inactive enrollment(s) to notify.`,
    );

    for (const enrollment of staleEnrollments) {
      const course = enrollment.courseId as any;
      const courseTitle = course?.title ?? 'your course';
      const courseIdStr = course?._id
        ? course._id.toString()
        : enrollment.courseId.toString();

      try {
        await this.notificationsService.create(
          enrollment.studentId,
          'We miss you!',
          `You haven't continued "${courseTitle}" in a while. Keep up the momentum!`,
          NotificationType.INACTIVITY_REMINDER,
          courseIdStr,
        );

        enrollment.lastInactivityNotifiedAt = new Date();
        await enrollment.save();
      } catch (error) {
        this.logger.error(
          `Failed to send inactivity reminder for enrollment ${enrollment._id}:`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }
}