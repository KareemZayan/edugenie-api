import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { QuizGenerationStatus } from '../../common/enums/questionsGenerationStatus.enum';
import { QuestionType } from '../../common/enums/questionsType.enum';
import { QuizDifficulty } from '../../common/enums/quizDifficulty.enum';

export type QuizDocument = HydratedDocument<Quiz>;

export interface QuizQuestion {
  questionText: string;
  type: QuestionType;
  options: string[];
  correctAnswers: string[];
}

@Schema({ timestamps: true })
export class Quiz {
  @Prop({ type: Types.ObjectId, ref: 'Section', required: true })
  sectionId: Types.ObjectId;
  @Prop({ type: String, enum: QuizDifficulty, required: true })
  difficulty: QuizDifficulty;
  @Prop({ required: true, min: 1, max: 50 })
  numberOfQuestions: number;
  @Prop({ type: String, enum: QuestionType, required: true })
  questionType: QuestionType;
  @Prop({ type: String, enum: QuizGenerationStatus, default: QuizGenerationStatus.PENDING })
  generationStatus: QuizGenerationStatus;
  @Prop({ type: String, enum: ['pending_review', 'approved'], default: 'pending_review' })
  status: string;
  @Prop({ required: true, default: 600 })
  timeLimit: number;
  @Prop({ required: true, min: 0, max: 100, default: 70 })
  passingScore: number;
  @Prop({ required: true, default: 3 })
  maxAttempts: number;
  // The AI-Generated Output (Initially Empty!)
  @Prop([{
    questionText: { type: String, required: true },
    type: { type: String, enum: QuestionType, required: true }, // e.g. TRUE_FALSE
    options: { type: [String], required: true }, // e.g. ["True", "False"]
    correctAnswers: { type: [String], required: true } // Handles multi-choice!
  }])
  questions: QuizQuestion[];
}

export const QuizSchema = SchemaFactory.createForClass(Quiz);