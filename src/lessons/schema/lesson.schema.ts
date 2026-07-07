import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type LessonDocument = HydratedDocument<Lesson>;

/** One time-coded transcript segment (approx. one sentence). */
@Schema({ _id: false })
export class TranscriptSegment {
  /** Start time in seconds from the video start (approximate — see WhisperX note). */
  @Prop({ required: true, type: Number, min: 0 })
  start!: number;

  @Prop({ required: true, trim: true })
  text!: string;
}
export const TranscriptSegmentSchema =
  SchemaFactory.createForClass(TranscriptSegment);

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

  /**
   * Time-coded transcript segments (clickable transcript + timestamped search).
   * Present only for transcripts generated with the segmented Gemini prompt;
   * legacy lessons have `transcript` only and render as plain, non-clickable
   * text. `transcript` is kept as the joined text for backward compatibility.
   */
  @Prop({ type: [TranscriptSegmentSchema], default: undefined })
  transcriptSegments?: TranscriptSegment[];

  // Lifecycle of the auto-generated transcript: 'pending' while google_speech
  // runs, 'ready' once saved, 'failed' if it never produced usable text.
  @Prop({ enum: ['pending', 'ready', 'failed'] })
  transcriptStatus?: 'pending' | 'ready' | 'failed';
}

export const LessonSchema = SchemaFactory.createForClass(Lesson);
