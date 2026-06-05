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

  @Prop({ required: true, min: 0, type: Number })
  videoDuration!: number;

  @Prop({ trim: true })
  transcript?: string;
}

export const LessonSchema = SchemaFactory.createForClass(Lesson);
