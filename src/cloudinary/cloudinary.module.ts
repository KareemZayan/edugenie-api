import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { Course, CourseSchema } from '../courses/schema/course.schema';
import { CoursesModule } from '../courses/courses.module';
import { CloudinaryController } from './cloudinary.controller';
import { CloudinaryService } from './cloudinary.service';
import { RagModule } from '../rag/rag.module';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([{ name: Course.name, schema: CourseSchema }]),
    CoursesModule,
    RagModule,
  ],
  controllers: [CloudinaryController],
  providers: [CloudinaryService],
  exports: [CloudinaryService],
})
export class CloudinaryModule {}
