import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { CourseLevel } from '../../shared/enums/level.enum';
import { CourseStatus } from '../../shared/enums/status.enum';
import { Section, SectionSchema } from './section.schema';

export type CourseDocument = HydratedDocument<Course>;

@Schema({ timestamps: true })
export class Course {
  @Prop({
    required: true,
    trim: true,
    minlength: 5,
  })
  title!: string;

  @Prop({
    required: true,
    trim: true,
    minlength: 20,
  })
  description!: string;

  @Prop({
    required: true,
    min: 0,
  })
  price!: number;

  @Prop({ required: true })
  thumbnail!: string;

  @Prop({
    required: true,
    enum: CourseLevel,
  })
  level!: CourseLevel;

  @Prop({
    enum: CourseStatus,
    default: CourseStatus.DRAFT,
  })
  courseStatus!: CourseStatus;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  instructorId!: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Category',
    required: true,
    index: true,
  })
  categoryId!: Types.ObjectId;

  @Prop({ type: [String], default: [] })
  goals!: string[];

  @Prop({ type: [String], default: [] })
  requirements!: string[];

  @Prop({ default: 0, min: 0 })
  ratingAverage!: number;

  @Prop({ default: 0, min: 0 })
  totalEnrollments!: number;

  @Prop({ default: 0, min: 0 })
  totalLessons!: number;

  @Prop({ default: 0, min: 0 })
  totalVideos!: number;

  @Prop({ default: 0, min: 0 })
  totalHours!: number;

  // Embedded subdocuments — Course is the aggregate root
  @Prop({ type: [SectionSchema], default: [] })
  sections!:Types.DocumentArray<Section>;
}

export const CourseSchema = SchemaFactory.createForClass(Course);