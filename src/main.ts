import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import mongoose from 'mongoose';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  mongoose.connection.on('connected', () => {
    console.log('Successfully connected to MongoDB!');
  });
  await app.listen(3000);
}
bootstrap();
