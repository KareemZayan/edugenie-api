import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { QuizGenerationStatus } from 'src/common/enums/questionsGenerationStatus.enum';
import { QuestionType } from 'src/common/enums/questionsType.enum';
import { QuizDifficulty } from 'src/common/enums/quizDifficulty.enum';

export type QuizDocument = HydratedDocument<Quiz>;

@Schema({ timestamps: true })
export class Quiz {
  @Prop({ type: Types.ObjectId, ref: 'Section', required: true })
  sectionId: Types.ObjectId;
  @Prop({ enum: QuizDifficulty, required: true })
  difficulty: QuizDifficulty;
  @Prop({ required: true, min: 1, max: 50 })
  numberOfQuestions: number;
  @Prop({ enum: QuestionType, required: true })
  questionType: QuestionType;
  @Prop({ enum: QuizGenerationStatus, default: QuizGenerationStatus.PENDING })
  generationStatus: QuizGenerationStatus;
  // The AI-Generated Output (Initially Empty!)
  @Prop([{
    questionText: { type: String, required: true },
    type: { type: String, enum: QuestionType, required: true }, // e.g. TRUE_FALSE
    options: { type: [String], required: true }, // e.g. ["True", "False"]
    correctAnswers: { type: [String], required: true } // Handles multi-choice!
  }])
  questions: any[];
}

export const QuizSchema = SchemaFactory.createForClass(Quiz);