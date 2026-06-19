import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type QuizAttemptDocument = HydratedDocument<QuizAttempt>;

@Schema({ timestamps: true })
export class QuizAttempt {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Quiz', required: true })
  quizId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Section', required: true })
  sectionId: Types.ObjectId;

  @Prop({ required: true })
  attemptNumber: number;

  @Prop({ type: Date, required: true, default: Date.now })
  startedAt: Date;

  @Prop({ type: Date, default: null })
  submittedAt: Date | null;

  @Prop({ required: true })
  timeLimit: number;

  @Prop([{
    questionId: { type: String, required: true },
    selectedOptionIds: { type: [String], required: true }
  }])
  answers: { questionId: string; selectedOptionIds: string[] }[];

  @Prop({ type: Number, min: 0, max: 100, default: null })
  score: number | null;

  @Prop({ type: Boolean, default: null })
  passed: boolean | null;

  @Prop({ type: Number, default: null })
  correctAnswers: number | null;

  @Prop({ type: Number, required: true })
  totalQuestions: number;

  @Prop({ type: String, required: true, enum: ['in_progress', 'submitted', 'expired'], default: 'in_progress' })
  status: string;
}

export const QuizAttemptSchema = SchemaFactory.createForClass(QuizAttempt);

QuizAttemptSchema.index({ studentId: 1, quizId: 1, attemptNumber: 1 }, { unique: true });
QuizAttemptSchema.index({ studentId: 1, quizId: 1, status: 1 });