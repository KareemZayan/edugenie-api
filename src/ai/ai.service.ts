import {
  Injectable,
  ForbiddenException,
  ServiceUnavailableException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Course } from '../courses/schema/course.schema';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import OpenAI from 'openai';

@Injectable()
export class AiService {
  private openai: OpenAI;

  constructor(
    @InjectModel(Course.name) private courseModel: Model<Course>,
    private enrollmentsService: EnrollmentsService,
  ) {
    // If running without API key, use dummy so it doesn't crash on init
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'dummy' });
  }

  async chat(lessonId: string, studentId: string, message: string) {
    if (!Types.ObjectId.isValid(lessonId)) {
      throw new BadRequestException('Invalid lesson ID');
    }

    const hasAccess = await this.enrollmentsService.canAccessLesson(
      studentId,
      lessonId,
    );

    if (!hasAccess) {
      throw new ForbiddenException(
        'You must purchase this section to use the AI tutor',
      );
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: message }],
      });
      return { reply: response.choices[0].message.content };
    } catch (error) {
      throw new ServiceUnavailableException(
        'AI service is currently unavailable. Please try again later.',
      );
    }
  }
}
