import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QuizzesController } from './quizzes.controller';
import { SectionQuizzesController } from './section-quizzes.controller';
import { QuizzesService } from './quizzes.service';
import { Quiz, QuizSchema } from './schema/quiz.schema';
import { QuizAttempt, QuizAttemptSchema } from './schema/quiz-attempt.schema';
import { Notification, NotificationSchema } from '../notifications/schema/notification.schema';
import { Enrollment, EnrollmentSchema } from '../enrollments/schema/enrollment.schema';
import { Course, CourseSchema } from '../courses/schema/course.schema';

import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { ProgressModule } from '../progress/progress.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Quiz.name, schema: QuizSchema },
      { name: QuizAttempt.name, schema: QuizAttemptSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: Enrollment.name, schema: EnrollmentSchema },
      { name: Course.name, schema: CourseSchema },
    ]),
    EnrollmentsModule,
    forwardRef(() => ProgressModule),
  ],
  controllers: [QuizzesController, SectionQuizzesController],
  providers: [QuizzesService],
  exports: [QuizzesService, MongooseModule]
})
export class QuizzesModule {}
