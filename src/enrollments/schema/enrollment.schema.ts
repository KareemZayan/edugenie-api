import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type EnrollmentDocument = HydratedDocument<Enrollment>;

@Schema({ timestamps: true })
export class Enrollment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  courseId: Types.ObjectId;

  // Track progress percentage (0 to 100)
  @Prop({ default: 0, min: 0, max: 100 })
  progressPercentage: number;

  // Array of lesson IDs the student has fully watched
  @Prop({ type: [{ type: Types.ObjectId }], default: [] })
  completedLessons: Types.ObjectId[];

  @Prop({ default: false })
  isCourseCompleted: boolean;
}

export const EnrollmentSchema = SchemaFactory.createForClass(Enrollment);
// Prevent the student from buying the exact same course twice!
EnrollmentSchema.index({ studentId: 1, courseId: 1 }, { unique: true });