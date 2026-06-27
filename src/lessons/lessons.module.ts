import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LessonsService } from './lessons.service';
import { LessonsController } from './lessons.controller';
import { Course, CourseSchema } from '../courses/schema/course.schema';
import { CoursesModule } from '../courses/courses.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { ProgressModule } from '../progress/progress.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { StudentLessonsController } from './student-lessons.controller';
import { NotificationsModule } from '../notifications/notifications.module';
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Course.name, schema: CourseSchema }]),
    CoursesModule,
    CloudinaryModule,
    ProgressModule,
    EnrollmentsModule,
    NotificationsModule,
  ],
  controllers: [LessonsController, StudentLessonsController],
  providers: [LessonsService],
})
export class LessonsModule {}
