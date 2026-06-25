import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { progressStateEnum } from '../../common/enums/progress.enum';

export type ProgressDocument = HydratedDocument<Progress>;

@Schema({ timestamps: true })
export class Progress {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  courseId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Section', required: true })
  sectionId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Lesson', required: true })
  lessonId: Types.ObjectId;

  @Prop({
    type: String,
    enum: progressStateEnum,
    default: progressStateEnum.NOT_STARTED,
  })
  lessonState: progressStateEnum;

  @Prop({ type: Number, default: 0, min: 0 })
  watchedDuration: number;

  @Prop({ type: Boolean, default: false })
  isCompleted: boolean;

  @Prop({ type: Date, default: null })
  completedAt: Date | null;

  @Prop({ type: Date, default: Date.now })
  lastWatchedAt: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ProgressSchema = SchemaFactory.createForClass(Progress);

ProgressSchema.index({ studentId: 1, lessonId: 1 }, { unique: true });
ProgressSchema.index({ studentId: 1, courseId: 1 });
