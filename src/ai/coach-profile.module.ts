import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CoachProfile,
  CoachProfileSchema,
} from './schema/coach-profile.schema';
import { CoachProfileService } from './coach-profile.service';

/**
 * Standalone home for the student's coaching state (streak + weekly goal). Kept
 * separate from AiModule so ProgressModule can record activity via
 * CoachProfileService without importing AiModule (which would create a cycle).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CoachProfile.name, schema: CoachProfileSchema },
    ]),
  ],
  providers: [CoachProfileService],
  exports: [CoachProfileService],
})
export class CoachProfileModule {}
