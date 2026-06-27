import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiGateway } from './ai.gateway';
import { Course, CourseSchema } from '../courses/schema/course.schema';
import { User, UserSchema } from '../users/schema/user.schema';
import {
  Enrollment,
  EnrollmentSchema,
} from '../enrollments/schema/enrollment.schema';

import { EnrollmentsModule } from '../enrollments/enrollments.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Course.name, schema: CourseSchema },
      { name: User.name, schema: UserSchema },
      { name: Enrollment.name, schema: EnrollmentSchema },
    ]),
    EnrollmentsModule,
    // Same signing config as AuthModule so the gateway can verify session JWTs.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [AiController],
  providers: [AiService, AiGateway],
  exports: [AiService],
})
export class AiModule {}
