import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class Enrollment extends Document {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  studentId!: MongooseSchema.Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Course',
    required: true,
    index: true,
  })
  courseId!: MongooseSchema.Types.ObjectId;

  @Prop({ default: 0 })
  progress!: number;

  @Prop({ default: false })
  completed!: boolean;
}

export const EnrollmentSchema = SchemaFactory.createForClass(Enrollment);
