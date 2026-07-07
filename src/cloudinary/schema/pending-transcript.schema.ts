import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PendingTranscriptDocument = HydratedDocument<PendingTranscript>;

/**
 * Holding area for a transcript whose Cloudinary completion webhook arrived
 * BEFORE the owning lesson subdocument existed (the course-builder creates the
 * lesson after the video upload). `persistTranscriptForPublicId` upserts here
 * when no lesson matches the videoPublicId; `addLesson`/`updateLesson` adopt
 * the transcript when a lesson finally references that publicId. The TTL index
 * auto-expires rows for videos whose lesson is never created (abandoned drafts).
 */
@Schema({ timestamps: true })
export class PendingTranscript {
  @Prop({ required: true, unique: true, index: true })
  videoPublicId!: string;

  @Prop({ required: true })
  transcript!: string;

  /** Time-coded segments (when the transcript was generated with timestamps). */
  @Prop({ type: [{ start: Number, text: String }], default: undefined })
  transcriptSegments?: { start: number; text: string }[];

  // Auto-delete after 24h so orphaned holds don't accumulate.
  @Prop({ type: Date, default: () => new Date(), expires: 60 * 60 * 24 })
  createdAt!: Date;
}

export const PendingTranscriptSchema =
  SchemaFactory.createForClass(PendingTranscript);
