import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PlacementController } from './placement.controller';
import { PlacementService } from './placement.service';
import {
  PlacementAttempt,
  PlacementAttemptSchema,
} from './schema/placement-attempt.schema';
import { Course, CourseSchema } from '../courses/schema/course.schema';
import { AiModule } from '../ai/ai.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { CartModule } from '../cart/cart.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PlacementAttempt.name, schema: PlacementAttemptSchema },
      { name: Course.name, schema: CourseSchema },
    ]),
    AiModule,
    EnrollmentsModule,
    CartModule,
  ],
  controllers: [PlacementController],
  providers: [PlacementService],
})
export class PlacementModule {}
