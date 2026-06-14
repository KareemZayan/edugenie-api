import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EnrollmentsService } from './enrollments.service';
import { EnrollmentsController } from './enrollments.controller';
import { Enrollment, EnrollmentSchema } from './schema/enrollment.schema';
import { Course, CourseSchema } from '../courses/schema/course.schema'; // Add this!

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Enrollment.name, schema: EnrollmentSchema },
      { name: Course.name, schema: CourseSchema } // Inject Course schema
    ])
  ],
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService]
})
export class EnrollmentsModule { }