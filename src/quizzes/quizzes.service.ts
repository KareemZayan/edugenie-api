import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Quiz } from './schema/quiz.schema';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { QuizGenerationStatus } from '../common/enums/questionsGenerationStatus.enum';

@Injectable()
export class QuizzesService {
  constructor(@InjectModel(Quiz.name) private quizModel: Model<Quiz>) {}

  async saveQuizConfig(dto: CreateQuizDto) {
    // Save the configuration to the database so the AI worker can pick it up later
    const quiz = await this.quizModel.create({
      sectionId: new Types.ObjectId(dto.sectionId),
      difficulty: dto.difficulty,
      numberOfQuestions: dto.numberOfQuestions,
      questionType: dto.questionType,
      generationStatus: QuizGenerationStatus.PENDING,
      questions: [], // Initially empty until the AI finishes!
    });

    return {
      message: 'Quiz configuration saved! AI generation is now pending.',
      quiz,
    };
  }
}
