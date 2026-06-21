import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LessonsService } from './lessons.service';
import { LessonsController } from './lessons.controller';
import { Course, CourseSchema } from '../courses/schema/course.schema';
import { CoursesModule } from '../courses/courses.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Course.name, schema: CourseSchema }]),
    CoursesModule,
    CloudinaryModule,
  ],
  controllers: [LessonsController],
  providers: [LessonsService],
})
export class LessonsModule {}
