import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';
import { Progress, ProgressSchema } from './schema/progress.schema';
import { Course, CourseSchema } from '../courses/schema/course.schema';
import { Quiz, QuizSchema } from '../quizzes/schema/quiz.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Progress.name, schema: ProgressSchema },
      { name: Course.name, schema: CourseSchema },
      { name: Quiz.name, schema: QuizSchema },
    ])
  ],
  controllers: [ProgressController],
  providers: [ProgressService],
  exports: [ProgressService, MongooseModule],
})
export class ProgressModule {}
