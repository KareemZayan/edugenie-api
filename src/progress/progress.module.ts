import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';
import { Progress, ProgressSchema } from './schema/progress.schema';
import { Course, CourseSchema } from '../courses/schema/course.schema';
import { Quiz, QuizSchema } from '../quizzes/schema/quiz.schema';
import {
  QuizAttempt,
  QuizAttemptSchema,
} from '../quizzes/schema/quiz-attempt.schema';
import {
  Enrollment,
  EnrollmentSchema,
} from '../enrollments/schema/enrollment.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { CoachProfileModule } from '../ai/coach-profile.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Progress.name, schema: ProgressSchema },
      { name: Course.name, schema: CourseSchema },
      { name: Quiz.name, schema: QuizSchema },
      { name: QuizAttempt.name, schema: QuizAttemptSchema },
      { name: Enrollment.name, schema: EnrollmentSchema },
    ]),
    NotificationsModule,
    CertificatesModule,
    CoachProfileModule,
  ],
  controllers: [ProgressController],
  providers: [ProgressService],
  exports: [ProgressService, MongooseModule],
})
export class ProgressModule {}
