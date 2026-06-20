import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Earning, EarningSchema } from './schema/earning.schema';
import { EarningsController } from './earnings.controller';
import { EarningsService } from './earnings.service';
import { Course, CourseSchema } from '../courses/schema/course.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Earning.name, schema: EarningSchema },
      { name: Course.name, schema: CourseSchema }
    ])
  ],
  controllers: [EarningsController],
  providers: [EarningsService],
  exports: [MongooseModule],
})
export class EarningsModule {}
