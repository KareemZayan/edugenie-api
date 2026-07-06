import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CertificateDocument = HydratedDocument<Certificate>;

@Schema({ timestamps: true })
export class Certificate {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  courseId: Types.ObjectId;

  // Human-facing id printed on the certificate, e.g. EG-2026-A1B2C3D4.
  @Prop({ required: true, unique: true })
  certificateNumber: string;

  // Public single-use-lookup code embedded in the QR / verify URL.
  @Prop({ required: true, unique: true, index: true })
  verificationCode: string;

  // Snapshots — keep the certificate immutable if names change later.
  @Prop({ required: true })
  studentName: string;

  @Prop({ required: true })
  courseTitle: string;

  @Prop({ required: true })
  instructorName: string;

  @Prop({ type: Date, default: Date.now })
  issuedAt: Date;
}

export const CertificateSchema = SchemaFactory.createForClass(Certificate);
// One certificate per student per course.
CertificateSchema.index({ studentId: 1, courseId: 1 }, { unique: true });
