import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
// AiGateway (WebSocket streaming) is intentionally NOT registered: the AI tutor
// runs over plain HTTP (see AiController) so the whole API can run on serverless
// (Vercel) without an always-on WebSocket server. The gateway file is kept for
// reference / future always-on hosting.
import { Course, CourseSchema } from '../courses/schema/course.schema';
import { User, UserSchema } from '../users/schema/user.schema';
import {
  Enrollment,
  EnrollmentSchema,
} from '../enrollments/schema/enrollment.schema';

import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { RagModule } from '../rag/rag.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Course.name, schema: CourseSchema },
      { name: User.name, schema: UserSchema },
      { name: Enrollment.name, schema: EnrollmentSchema },
    ]),
    EnrollmentsModule,
    // RAG retrieval for grounded, cited tutor answers (Phase 2).
    RagModule,
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
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
