import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReviewsController } from './reviews.controller';
import { InstructorReviewsController } from './instructor-reviews.controller';
import { ReviewsService } from './reviews.service';
import { Review, ReviewSchema } from './schema/review.schema';
import { Course, CourseSchema } from '../courses/schema/course.schema';
import {
  Enrollment,
  EnrollmentSchema,
} from '../enrollments/schema/enrollment.schema';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Review.name, schema: ReviewSchema },
      { name: Course.name, schema: CourseSchema },
      { name: Enrollment.name, schema: EnrollmentSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [ReviewsController, InstructorReviewsController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
