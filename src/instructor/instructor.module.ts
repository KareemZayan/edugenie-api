import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InstructorController } from './instructor.controller';
import { InstructorService } from './instructor.service';
import { InstructorSummaryService } from './instructor-summary.service';
import { Course, CourseSchema } from '../courses/schema/course.schema';
import { Earning, EarningSchema } from '../orders/schema/earning.schema';
import {
  Enrollment,
  EnrollmentSchema,
} from '../enrollments/schema/enrollment.schema';
import { Review, ReviewSchema } from '../reviews/schema/review.schema';
import { Quiz, QuizSchema } from '../quizzes/schema/quiz.schema';
import { Progress, ProgressSchema } from '../progress/schema/progress.schema';
import { User, UserSchema } from '../users/schema/user.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { Order, OrderSchema } from '../orders/schema/order.schema';


@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Course.name, schema: CourseSchema },
      { name: Earning.name, schema: EarningSchema },
      { name: Enrollment.name, schema: EnrollmentSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: Quiz.name, schema: QuizSchema },
      { name: Progress.name, schema: ProgressSchema },
      { name: User.name, schema: UserSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [InstructorController],
  providers: [InstructorService, InstructorSummaryService],
  exports: [InstructorService],
})
export class InstructorModule { }
