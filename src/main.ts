import 'dotenv/config'; // Must be the very first line!
import { NestFactory, Reflector } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import mongoose from 'mongoose';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { Logger } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { MongoExceptionFilter } from './common/filters/mongo-exception.filter';
import 'reflect-metadata';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(helmet());
  app.use(cookieParser());


  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true }
    }),
  );

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  app.useGlobalFilters(new GlobalExceptionFilter(), new MongoExceptionFilter());

  app.enableCors({
    origin: ['https://edugenie-dashboard.vercel.app', 'https://edugenie-student-web.vercel.app', 'http://localhost:4200', 'http://localhost:3000'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });
  mongoose.connection.on('connected', () => {
    Logger.log('Successfully connected to MongoDB', 'Mongoose');
  });

  const config = new DocumentBuilder()
    .setTitle('EduGenie API')
    .setDescription('The EduGenie API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3000;

  await app.listen(port);
  Logger.log(`Application is running on: http://localhost:${port}`, 'Bootstrap');
}

bootstrap().catch((err) => {
  Logger.error('Error during bootstrap', err, 'Bootstrap');
});
