import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { MongooseModule } from '@nestjs/mongoose';

import { CoursesService } from './courses.service';
import { CoursesController } from './courses.controller';
import { InstructorCoursesController } from './instructor-courses.controller';

import { Course, CourseSchema } from './schema/course.schema';
import { Earning, EarningSchema } from '../orders/schema/earning.schema';
import { Category, CategorySchema } from '../categories/schema/category.schema';
import { User, UserSchema } from '../users/schema/user.schema';
import { ProgressModule } from '../progress/progress.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { RagModule } from '../rag/rag.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Course.name, schema: CourseSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Earning.name, schema: EarningSchema },
      { name: User.name, schema: UserSchema },
    ]),
    CacheModule.register({
      ttl: 60000, // cache for 1 minute
      max: 100, // maximum number of items in cache
    }),
    ProgressModule,
    EnrollmentsModule,
    NotificationsModule,
    RagModule,
  ],
  controllers: [CoursesController, InstructorCoursesController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
