import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as Joi from 'joi';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CoursesModule } from './courses/courses.module';
import { SectionsModule } from './sections/sections.module';
import { LessonsModule } from './lessons/lessons.module';
import { CategoriesModule } from './categories/categories.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        MONGO_URI: Joi.string().required(),
        JWT_SECRET: Joi.string().required(),
        PORT: Joi.number().default(3000),
        CLOUDINARY_CLOUD_NAME: Joi.string().required(),
        CLOUDINARY_API_KEY: Joi.string().required(),
        CLOUDINARY_API_SECRET: Joi.string().required(),
      }),
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (ConfigService: ConfigService) => ({
        uri: ConfigService.get<string>('MONGO_URI'),
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    CoursesModule,
    SectionsModule,
    LessonsModule,
    CategoriesModule,
    CartModule,
    OrdersModule,
    EnrollmentsModule,
    CloudinaryModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
