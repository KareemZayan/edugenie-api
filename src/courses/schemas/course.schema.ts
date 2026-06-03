import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { CourseLevel } from '../../shared/enums/level.enum';
import { CourseStatus } from '../../shared/enums/status.enum';

@Schema({ _id: true, timestamps: true })
export class Lesson {
    @Prop({ required: true, trim: true })
    title!: string;

    @Prop({ required: true })
    videoUrl!: string;

    @Prop({ required: true })
    videoPublicId!: string;

    @Prop({ required: true })
    videoDuration!: number;

    @Prop()
    transcript?: string;
}
const LessonSchema = SchemaFactory.createForClass(Lesson);


@Schema({ _id: true, timestamps: true })
export class Section {
    @Prop({ required: true, trim: true })
    title!: string;

    @Prop({
        required: true,
        trim: true,
        minlength: 10,
    })
    description!: string;

    @Prop({ type: [String], default: [] })
    expectedOutcomes!: string[];

    @Prop({ default: false })
    isBasicSection!: boolean;

    @Prop({ type: [LessonSchema], default: [] })
    lessons!: Lesson[];
}
const SectionSchema = SchemaFactory.createForClass(Section);


@Schema({ timestamps: true })
export class Course extends Document {
  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ required: true, min: 0 })
  price!: number;

  @Prop({ required: true })
  thumbnail!: string;

  @Prop({ type: [String], default: [] })
  goals!: string[];

  @Prop({ type: [String], default: [] })
  requirements!: string[];

  @Prop({ required: true, enum: CourseLevel })
  level!: CourseLevel;

    @Prop({ required: true, enum: CourseStatus, default: CourseStatus.DRAFT })
    courseStatus!: CourseStatus;


  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  instructorId!: MongooseSchema.Types.ObjectId;

    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: 'Category',
        required: true,
        index: true,
    })
    categoryId!: MongooseSchema.Types.ObjectId;


  @Prop({ default: 0, min: 0 })
  ratingAverage!: number;

  @Prop({ default: 0, min: 0 })
  totalEnrollments!: number;

  @Prop({ default: 0, min: 0 })
  totalLessons!: number;

  @Prop({ default: 0, min: 0 })
  totalVideos!: number;

    @Prop({ default: 0, min: 0 })
    totalHour!: number;


  @Prop({ type: [SectionSchema], default: [] })
  sections!: Section[];
}

export const CourseSchema = SchemaFactory.createForClass(Course);

