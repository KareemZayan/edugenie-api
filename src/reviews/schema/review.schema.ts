import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ReviewDocument = HydratedDocument<Review>;

@Schema({ timestamps: true })
export class Review {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  courseId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  sectionId: Types.ObjectId;   // <-- NEW: id of the subdocument inside course.sections

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId: Types.ObjectId;

  @Prop({ required: true, min: 1, max: 5 })
  rating: number;

  @Prop({ required: true })
  comment: string;

  @Prop({ default: false })
  isFlagged: boolean;

  @Prop({ type: String, default: null })
  flagReason?: string | null;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);

// CHANGED: was unique on {courseId, studentId} — one review per course.
// Now it's one review per student PER SECTION.
ReviewSchema.index({ courseId: 1, sectionId: 1, studentId: 1 }, { unique: true });