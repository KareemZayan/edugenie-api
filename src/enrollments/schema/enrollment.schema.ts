import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { PurchaseType } from '../../common/enums/purchase-type.enum';

export type EnrollmentDocument = HydratedDocument<Enrollment>;

@Schema({ timestamps: true })
export class Enrollment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  courseId: Types.ObjectId;

  @Prop({
    type: String,
    enum: PurchaseType,
    required: true,
    default: PurchaseType.FULL_COURSE,
  })
  type: PurchaseType;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Section' }], default: [] })
  sectionIds: Types.ObjectId[];

  // Track progress percentage (0 to 100)
  @Prop({ default: 0, min: 0, max: 100 })
  progressPercentage: number;

  // Array of lesson IDs the student has fully watched
  @Prop({ type: [{ type: Types.ObjectId }], default: [] })
  completedLessons: Types.ObjectId[];

  @Prop({ default: false })
  isCourseCompleted: boolean;

  @Prop({ type: Date, default: Date.now })
  lastActivityAt: Date;

  @Prop({ type: Date, default: null })
  lastInactivityNotifiedAt: Date | null;

  @Prop({ default: false })
  milestone50Notified: boolean;
}

export const EnrollmentSchema = SchemaFactory.createForClass(Enrollment);
// Prevent the student from buying the exact same course twice!
EnrollmentSchema.index({ studentId: 1, courseId: 1 }, { unique: true });
