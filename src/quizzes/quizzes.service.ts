import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Quiz } from './schema/quiz.schema';
import { QuizAttempt } from './schema/quiz-attempt.schema';

@Injectable()
export class QuizzesService {
  constructor(
    @InjectModel(Quiz.name) private quizModel: Model<Quiz>,
    @InjectModel(QuizAttempt.name) private attemptModel: Model<QuizAttempt>,
  ) { }

  // 1. Instructor creates a quiz
  async createQuiz(courseId: string, title: string, questions: any[]) {
    return this.quizModel.create({
      courseId: new Types.ObjectId(courseId),
      title,
      questions,
    });
  }

  // 2. Student submits answers
  async submitQuiz(studentId: string, quizId: string, studentAnswers: number[]) {
    const quiz = await this.quizModel.findById(quizId);
    if (!quiz) throw new NotFoundException('Quiz not found');

    let correctCount = 0;

    // Compare student answers with the database
    quiz.questions.forEach((question, index) => {
      if (studentAnswers[index] === question.correctOptionIndex) {
        correctCount++;
      }
    });

    // Calculate Percentage
    const score = Math.round((correctCount / quiz.questions.length) * 100);
    const isPassed = score >= quiz.passingScore;

    // Save their attempt
    const attempt = await this.attemptModel.create({
      studentId: new Types.ObjectId(studentId),
      quizId: new Types.ObjectId(quizId),
      score,
      isPassed,
    });

    return { score, isPassed, message: isPassed ? 'Congratulations!' : 'Try again.' };
  }
}