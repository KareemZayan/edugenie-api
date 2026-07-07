import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { Course, CourseSchema } from '../courses/schema/course.schema';
import { CoursesModule } from '../courses/courses.module';
import { CloudinaryController } from './cloudinary.controller';
import { CloudinaryService } from './cloudinary.service';
import { RagModule } from '../rag/rag.module';
import { GeminiTranscriptionProvider } from '../ai/gemini-transcription.provider';
import { OpenAiTranscriptionProvider } from '../ai/openai-transcription.provider';
import {
  TRANSCRIPTION_PROVIDER,
  TranscriptionProvider,
} from '../ai/transcription.provider';
import { Logger } from '@nestjs/common';
import {
  PendingTranscript,
  PendingTranscriptSchema,
} from './schema/pending-transcript.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: Course.name, schema: CourseSchema },
      { name: PendingTranscript.name, schema: PendingTranscriptSchema },
    ]),
    CoursesModule,
    RagModule,
  ],
  controllers: [CloudinaryController],
  providers: [
    CloudinaryService,
    GeminiTranscriptionProvider,
    OpenAiTranscriptionProvider,
    {
      // Prefer OpenAI Whisper for transcription (real segment timestamps + more
      // headroom than Gemini's free-tier audio quota); fall back to Gemini.
      provide: TRANSCRIPTION_PROVIDER,
      inject: [OpenAiTranscriptionProvider, GeminiTranscriptionProvider],
      useFactory: (
        openai: OpenAiTranscriptionProvider,
        gemini: GeminiTranscriptionProvider,
      ): TranscriptionProvider => {
        const active = openai.isConfigured ? openai : gemini;
        new Logger('TranscriptionProvider').log(
          `Active transcription provider: ${active.constructor.name} (${active.model})`,
        );
        return active;
      },
    },
  ],
  exports: [CloudinaryService],
})
export class CloudinaryModule {}
