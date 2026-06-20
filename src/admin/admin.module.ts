import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Course, CourseSchema } from '../courses/schema/course.schema';
import { User, UserSchema } from '../users/schema/user.schema';
import { Report, ReportSchema } from '../reports/schema/report.schema';
import { Earning, EarningSchema } from '../earnings/schema/earning.schema';
import { Category, CategorySchema } from '../categories/schema/category.schema';
import { Review, ReviewSchema } from '../reviews/schema/review.schema';
import { AuditLog, AuditLogSchema } from '../audit-logs/schemas/audit-log.schema';
import { Notification, NotificationSchema } from '../notifications/schema/notification.schema';

import { AdminController } from './controllers/admin.controller';
import { AdminCoursesController } from './controllers/admin-courses.controller';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminReportsController } from './controllers/admin-reports.controller';
import { AdminCategoriesController } from './controllers/admin-categories.controller';

import { AdminAnalyticsService } from './services/admin-analytics.service';
import { AdminCoursesService } from './services/admin-courses.service';
import { AdminUsersService } from './services/admin-users.service';
import { AdminReportsService } from './services/admin-reports.service';
import { AdminCategoriesService } from './services/admin-categories.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Course.name, schema: CourseSchema },
      { name: User.name, schema: UserSchema },
      { name: Report.name, schema: ReportSchema },
      { name: Earning.name, schema: EarningSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Review.name, schema: ReviewSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  controllers: [
    AdminController,
    AdminCoursesController,
    AdminUsersController,
    AdminReportsController,
    AdminCategoriesController,
  ],
  providers: [
    AdminAnalyticsService,
    AdminCoursesService,
    AdminUsersService,
    AdminReportsService,
    AdminCategoriesService,
  ],
})
export class AdminModule {}
