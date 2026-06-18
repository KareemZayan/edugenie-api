import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { Course, CourseSchema } from '../courses/schema/course.schema';
import { Enrollment, EnrollmentSchema } from '../enrollments/schema/enrollment.schema';

import { EnrollmentsModule } from '../enrollments/enrollments.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Course.name, schema: CourseSchema },
      { name: Enrollment.name, schema: EnrollmentSchema },
    ]),
    EnrollmentsModule,
  ],
  controllers: [AiController],
  providers: [AiService]
})
export class AiModule {}
