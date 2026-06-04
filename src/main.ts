import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import mongoose from 'mongoose';
import { ValidationPipe } from '@nestjs/common';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: [
      'https://edugenie-dashboard.vercel.app',
      'http://localhost:4200'
    ],
    credentials: true,
  });

  mongoose.connection.on('connected', () => {
    console.log('Successfully connected to MongoDB');
  });

  await app.listen(3000);
}

bootstrap();
