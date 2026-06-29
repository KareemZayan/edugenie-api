import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/** One generated practice question. `correctAnswers` is server-side only. */
export interface PracticeQuestion {
  id: string;
  questionText: string;
  type: string;
  options: string[];
  correctAnswers: string[];
}

/**
 * An on-demand practice quiz a student generates to drill a section (e.g. a
 * Coach weak spot). Unlike instructor quizzes it never counts toward progress —
 * the generated test (with answers) is stored only so submission can be graded
 * server-side without trusting the client. Auto-expires 2h via a TTL index.
 */
@Schema({ timestamps: true })
export class PracticeQuiz {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  studentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  courseId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Section', required: true })
  sectionId: Types.ObjectId;

  @Prop({ required: true })
  courseTitle: string;

  @Prop({ required: true })
  sectionTitle: string;

  @Prop({ required: true })
  difficulty: string;

  @Prop({ type: Array, default: [] })
  questions: PracticeQuestion[];

  @Prop({ default: 'generated', enum: ['generated', 'submitted'] })
  status: string;

  @Prop({ type: Number, default: null })
  score: number | null;

  @Prop({ type: Date, required: true })
  expiresAt: Date;
}

export type PracticeQuizDocument = HydratedDocument<PracticeQuiz>;
export const PracticeQuizSchema = SchemaFactory.createForClass(PracticeQuiz);
PracticeQuizSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
