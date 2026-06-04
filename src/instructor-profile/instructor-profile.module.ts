import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InstructorProfileController } from './controllers/instructor-profile.controller';
import { InstructorProfileService } from './services/instructor-profile.service';
import { InstructorProfileRepository } from './repositories/instructor-profile.repository';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Course, CourseSchema } from '../courses/schemas/course.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Course.name, schema: CourseSchema },
    ]),
  ],
  controllers: [InstructorProfileController],
  providers: [InstructorProfileService, InstructorProfileRepository],
  exports: [InstructorProfileService],
})
export class InstructorProfileModule {}
