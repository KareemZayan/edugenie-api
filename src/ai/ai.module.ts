import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { CoachService } from './coach.service';
import { PracticeController } from './practice.controller';
import { PracticeService } from './practice.service';
import {
  PracticeQuiz,
  PracticeQuizSchema,
} from './schema/practice-quiz.schema';
import { RoadmapController } from './roadmap.controller';
import { RoadmapService } from './roadmap.service';
import { Roadmap, RoadmapSchema } from './schema/roadmap.schema';
import { RemediationController } from './remediation.controller';
import { RemediationService } from './remediation.service';
import {
  RemediationPlan,
  RemediationPlanSchema,
} from './schema/remediation-plan.schema';
import { Quiz, QuizSchema } from '../quizzes/schema/quiz.schema';
import {
  Notification,
  NotificationSchema,
} from '../notifications/schema/notification.schema';
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
import {
  QuizAttempt,
  QuizAttemptSchema,
} from '../quizzes/schema/quiz-attempt.schema';
import { Progress, ProgressSchema } from '../progress/schema/progress.schema';

import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { RagModule } from '../rag/rag.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CoachProfileModule } from './coach-profile.module';
import { CoachCronService } from './coach-cron.service';
import { CoachMissionsService } from './coach-missions.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Course.name, schema: CourseSchema },
      { name: User.name, schema: UserSchema },
      { name: Enrollment.name, schema: EnrollmentSchema },
      { name: QuizAttempt.name, schema: QuizAttemptSchema },
      { name: PracticeQuiz.name, schema: PracticeQuizSchema },
      { name: Roadmap.name, schema: RoadmapSchema },
      { name: RemediationPlan.name, schema: RemediationPlanSchema },
      { name: Quiz.name, schema: QuizSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: Progress.name, schema: ProgressSchema },
    ]),
    EnrollmentsModule,
    // RAG retrieval for grounded, cited tutor answers (Phase 2).
    RagModule,
    // Streak + weekly-goal state; also the proactive coach cron pushes here.
    CoachProfileModule,
    // Proactive coach nudges (weekly digest, weak-spot quiz-ready, goal reached).
    NotificationsModule,
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
  controllers: [
    AiController,
    PracticeController,
    RoadmapController,
    RemediationController,
  ],
  providers: [
    AiService,
    CoachService,
    CoachCronService,
    CoachMissionsService,
    PracticeService,
    RoadmapService,
    RemediationService,
  ],
  exports: [AiService, RemediationService, RoadmapService],
})
export class AiModule {}
