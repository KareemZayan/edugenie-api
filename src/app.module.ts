import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import * as Joi from 'joi';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { UsersModule } from './users/users.module';
import { CoursesModule } from './courses/courses.module';
import { SectionsModule } from './sections/sections.module';
import { LessonsModule } from './lessons/lessons.module';
import { CategoriesModule } from './categories/categories.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { QuizzesModule } from './quizzes/quizzes.module';
import { PlacementModule } from './placement/placement.module';
import { RagModule } from './rag/rag.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { ReviewsModule } from './reviews/reviews.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AiModule } from './ai/ai.module';
import { PaymobModule } from './paymob/paymob.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { ProgressModule } from './progress/progress.module';
import { NotesModule } from './notes/notes.module';
import { InstructorModule } from './instructor/instructor.module';
import { EarningsModule } from './earnings/earnings.module';
import { AdminModule } from './admin/admin.module';
import { ReportsModule } from './reports/reports.module';
import { SuperAdminModule } from './superadmin/superadmin.module';
import { ScheduleModule } from '@nestjs/schedule';
import { AttachmentsModule } from './attachments/attachments.module';
@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        MONGO_URI: Joi.string().required(),
        JWT_SECRET: Joi.string().min(16).required(),
        PORT: Joi.number().default(3000),
        CLOUDINARY_CLOUD_NAME: Joi.string().required(),
        CLOUDINARY_API_KEY: Joi.string().required(),
        CLOUDINARY_API_SECRET: Joi.string().required(),
        // Allow '' so a blank placeholder in .env doesn't block boot; the AI
        // service treats empty as "not configured".
        SBG_API_URL: Joi.string().uri().allow('').optional(),
        SBG_API_KEY: Joi.string().allow('').optional(),
        SBG_MODEL: Joi.string().allow('').optional(),
        // RAG embeddings (Google Gemini text-embedding-004). Optional: without
        // it, RAG indexing is disabled but the rest of the app boots normally.
        GEMINI_API_KEY: Joi.string().allow('').optional(),
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        // Payments — required in production so the webhook can verify HMACs.
        PAYMOB_SECRET_KEY: Joi.string().optional(),
        PAYMOB_HMAC_SECRET: Joi.string().optional(),
        PAYMOB_INTEGRATION_ID: Joi.string().optional(),
        // Transactional email (Resend) — used by the admin-invite flow.
        RESEND_API_KEY: Joi.string().optional(),
        MAIL_FROM: Joi.string().default('EduGenie <noreply@edugenie.app>'),
        // Front-end origins used for invite/redirect links and CORS.
        DASHBOARD_URL: Joi.string().default('http://localhost:4200'),
        STUDENT_APP_URL: Joi.string().default('http://localhost:3000'),
        // Google OAuth sign-in (optional — endpoints only complete the flow once
        // client id/secret are set). GOOGLE_CALLBACK_URL must exactly match the
        // "Authorized redirect URI" in Google Cloud Console.
        GOOGLE_CLIENT_ID: Joi.string().allow('').optional(),
        GOOGLE_CLIENT_SECRET: Joi.string().allow('').optional(),
        GOOGLE_CALLBACK_URL: Joi.string().uri().allow('').optional(),
        // Where the callback sends the browser after success (defaults to
        // `${STUDENT_APP_URL}/auth-callback`).
        GOOGLE_SUCCESS_REDIRECT: Joi.string().uri().allow('').optional(),
        CORS_ORIGINS: Joi.string().optional(),
        CLOUDINARY_WEBHOOK_URL: Joi.string().uri().optional(),
      }),
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (ConfigService: ConfigService) => ({
        uri: ConfigService.get<string>('MONGO_URI'),
      }),
      inject: [ConfigService],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // global limit
      },
    ]),
    MailModule,
    AuthModule,
    UsersModule,
    CoursesModule,
    SectionsModule,
    LessonsModule,
    CategoriesModule,
    CartModule,
    OrdersModule,
    EnrollmentsModule,
    QuizzesModule,
    PlacementModule,
    RagModule,
    CloudinaryModule,
    ReviewsModule,
    NotificationsModule,
    AiModule,
    PaymobModule,
    WebhooksModule,
    ProgressModule,
    NotesModule,
    InstructorModule,
    EarningsModule,
    ReportsModule,
    AdminModule,
    SuperAdminModule,
    AttachmentsModule
  ],

  controllers: [AppController],
  providers: [
    AppService,
    // Enforce rate limiting on every route, not just /auth.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule { }
