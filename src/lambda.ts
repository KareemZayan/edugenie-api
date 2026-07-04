import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { MongoExceptionFilter } from './common/filters/mongo-exception.filter';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import express from 'express';
import { IncomingMessage, ServerResponse } from 'http';

// Raise the serverless function timeout: the Cloudinary upload webhook runs
// Gemini transcription inline (~15-40s for a lesson's audio). Default ~10s would
// kill it. 60s is the Hobby ceiling; raise further on Pro if needed.
export const config = { maxDuration: 60 };

let cachedApp: express.Express | null = null;

async function createApp(): Promise<express.Express> {
  const expressApp = express();
  const adapter = new ExpressAdapter(expressApp);

  const app = await NestFactory.create(AppModule, adapter, { rawBody: true });

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

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: ${origin}`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.setGlobalPrefix('api');

  await app.init();

  return expressApp;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!cachedApp) {
    cachedApp = await createApp();
  }
  cachedApp(req, res);
}