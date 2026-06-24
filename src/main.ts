import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ValidationPipe, ClassSerializerInterceptor, Logger } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { MongoExceptionFilter } from './common/filters/mongo-exception.filter';
import mongoose from 'mongoose';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(helmet());
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new GlobalExceptionFilter(), new MongoExceptionFilter());

  const allowedOrigins = [
    process.env.NEXTJS_APP_URL,
    process.env.ANGULAR_APP_URL,
    'http://localhost:3000',
    'http://localhost:4200',
  ].filter(Boolean) as string[];

  const allowedOrigins = [
    process.env.NEXTJS_APP_URL,      // e.g. https://your-nextjs.vercel.app
    process.env.ANGULAR_APP_URL,     // e.g. https://your-angular.vercel.app
    'http://localhost:3000',
    'http://localhost:4200',
  ].filter(Boolean);

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: ${origin}`));
      }
    },
    credentials: true,          // ← CRITICAL: allows cookies cross-origin
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.setGlobalPrefix('api');   // ← only once

  const config = new DocumentBuilder()
    .setTitle('EduGenie API')
    .setDescription('The EduGenie API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3001;

  await app.listen(port);       // ← only once

  mongoose.connection.on('connected', () => {
    Logger.log('Successfully connected to MongoDB', 'Mongoose');
  });

  Logger.log(`Application running on: http://localhost:${port}`, 'Bootstrap');
}

bootstrap().catch((err) => {
  Logger.error('Error during bootstrap', err, 'Bootstrap');
});