import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EnrollmentsService } from './enrollments.service';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsCronService } from './enrollments-cron.service';
import { Enrollment, EnrollmentSchema } from './schema/enrollment.schema';
import { Course, CourseSchema } from '../courses/schema/course.schema';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Enrollment.name, schema: EnrollmentSchema },
      { name: Course.name, schema: CourseSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService, EnrollmentsCronService],
  exports: [EnrollmentsService, MongooseModule],
})
export class EnrollmentsModule {}
