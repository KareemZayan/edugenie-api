import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type QuizDocument = HydratedDocument<Quiz>;

@Schema({ timestamps: true })
export class Quiz {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  courseId: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  // The actual questions
  @Prop([{
    questionText: { type: String, required: true },
    options: { type: [String], required: true },
    correctOptionIndex: { type: Number, required: true } // e.g., 0 for 'A', 1 for 'B'
  }])
  questions: { questionText: string; options: string[]; correctOptionIndex: number }[];

  @Prop({ default: 80 }) // 80% to pass
  passingScore: number;
}

export const QuizSchema = SchemaFactory.createForClass(Quiz);