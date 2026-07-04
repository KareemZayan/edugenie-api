import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type LessonDocument = HydratedDocument<Lesson>;

@Schema({ timestamps: true })
export class Lesson {
  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true })
  videoUrl!: string;

  @Prop({ required: true })
  videoPublicId!: string;

  @Prop({ required: true, min: 0, max: 900, type: Number })
  videoDuration!: number;

  @Prop({ trim: true })
  transcript?: string;

  // Lifecycle of the auto-generated transcript: 'pending' while google_speech
  // runs, 'ready' once saved, 'failed' if it never produced usable text.
  @Prop({ enum: ['pending', 'ready', 'failed'] })
  transcriptStatus?: 'pending' | 'ready' | 'failed';
}

export const LessonSchema = SchemaFactory.createForClass(Lesson);
