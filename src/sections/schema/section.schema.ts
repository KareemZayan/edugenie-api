import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Lesson, LessonSchema } from '../../lessons/schema/lesson.schema';

export type SectionDocument = HydratedDocument<Section>;

@Schema({ timestamps: true })
export class Section {
  @Prop({ required: true, trim: true, index: true })
  title!: string;

  @Prop({
    required: true,
    trim: true,
    minlength: 10,
  })
  description!: string;

  @Prop({ type: [String], default: [] })
  expectedOutcomes!: string[];

  @Prop({ type: Number, default: null, min: 0 })
  price!: number | null;

  @Prop({ type: [LessonSchema], default: [] })
  lessons!: Types.DocumentArray<Lesson>;

  @Prop({ default: null })
  previewVideoUrl!: string | null;

  @Prop({ default: null })
  previewVideoPublicId!: string | null;
}

export const SectionSchema = SchemaFactory.createForClass(Section);
