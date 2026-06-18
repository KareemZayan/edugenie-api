import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { MongooseModule } from '@nestjs/mongoose';

import { CoursesService } from './courses.service';
import { CoursesController } from './courses.controller';

import { Course, CourseSchema } from './schema/course.schema';
import { Category, CategorySchema } from '../categories/schema/category.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Course.name, schema: CourseSchema },
      { name: Category.name, schema: CategorySchema },
    ]),
    CacheModule.register({
      ttl: 60000, // cache for 1 minute
      max: 100, // maximum number of items in cache
    }),
  ],
  controllers: [CoursesController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
