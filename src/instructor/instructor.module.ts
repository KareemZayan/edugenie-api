import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InstructorController } from './instructor.controller';
import { InstructorService } from './instructor.service';
import { Course, CourseSchema } from '../courses/schema/course.schema';
import { Earning, EarningSchema } from '../earnings/schema/earning.schema';
import { Enrollment, EnrollmentSchema } from '../enrollments/schema/enrollment.schema';
import { Review, ReviewSchema } from '../reviews/schema/review.schema';
import { Quiz, QuizSchema } from '../quizzes/schema/quiz.schema';
import { Progress, ProgressSchema } from '../progress/schema/progress.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Course.name, schema: CourseSchema },
      { name: Earning.name, schema: EarningSchema },
      { name: Enrollment.name, schema: EnrollmentSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: Quiz.name, schema: QuizSchema },
      { name: Progress.name, schema: ProgressSchema },
    ]),
  ],
  controllers: [InstructorController],
  providers: [InstructorService],
})
export class InstructorModule {}
