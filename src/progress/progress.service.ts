import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Progress } from './schema/progress.schema';
import { Course } from '../courses/schema/course.schema';
import { Quiz } from '../quizzes/schema/quiz.schema';
import { TrackProgressDto } from './dto/track-progress.dto';
import { ProgressResponse } from './interfaces/progress-response.interface';
import { progressStateEnum } from 'src/common/enums/progress.enum';

@Injectable()
export class ProgressService {
  constructor(
    @InjectModel(Progress.name) private progressModel: Model<Progress>,
    @InjectModel(Course.name) private courseModel: Model<Course>,
    @InjectModel(Quiz.name) private quizModel: Model<Quiz>,
  ) { }

  async trackProgress(dto: TrackProgressDto, studentId: string): Promise<ProgressResponse> {
    const { lessonId, watchedDuration, isCompleted } = dto;
    const lessonObjectId = new Types.ObjectId(lessonId);

    // 1. Find the lesson to get its sectionId and courseId
    const course = await this.courseModel.findOne({ 'sections.lessons._id': lessonObjectId });
    if (!course) {
      throw new NotFoundException('Lesson not found');
    }

    let foundSection = null;
    let foundLesson = null;
    let lessonIndex = -1;
    for (const section of course.sections) {
      lessonIndex = section.lessons.findIndex(l => l._id.toString() === lessonId);
      if (lessonIndex !== -1) {
        foundSection = section;
        foundLesson = section.lessons[lessonIndex];
        break;
      }
    }

    if (!foundSection || !foundLesson) {
      throw new NotFoundException('Lesson not found inside course');
    }

    // 2. Upsert the Progress record
    const updatedProgress = await this.progressModel.findOneAndUpdate(
      { studentId: new Types.ObjectId(studentId), lessonId: lessonObjectId },
      {
        $set: {
          courseId: course._id,
          watchedDuration,
          isCompleted,
          lessonState: isCompleted ? 'completed' : 'in_progress',
          completedAt: isCompleted ? new Date() : null,
          lastWatchedAt: new Date(),
        }
      },
      { upsert: true, new: true }
    );

    let nextLessonUnlocked = false;
    let nextLesson = null;
    let sectionCompleted = false;
    let quizRequired = false;
    let quizSectionId = null;

    // 3. Determine nextLessonUnlocked
    if (isCompleted) {
      if (lessonIndex + 1 < foundSection.lessons.length) {
        nextLessonUnlocked = true;
        const nextL = foundSection.lessons[lessonIndex + 1];
        nextLesson = {
          _id: nextL._id.toString(),
          title: nextL.title,
        };
      } else {
        // Last lesson in the section, so check if section is completed
        sectionCompleted = true;
      }
    }

    // 4. Determine sectionCompleted
    const sectionLessonIds = foundSection.lessons.map(l => l._id);
    const completedCount = await this.progressModel.countDocuments({
      studentId: new Types.ObjectId(studentId),
      lessonId: { $in: sectionLessonIds },
      isCompleted: true,
    });

    if (completedCount === foundSection.lessons.length) {
      sectionCompleted = true;
    } else {
      sectionCompleted = false;
    }

    // 5. Determine quizRequired
    if (sectionCompleted) {
      const quiz = await this.quizModel.findOne({ sectionId: foundSection._id });
      if (quiz) {
        quizRequired = true;
        quizSectionId = foundSection._id.toString();
      } else {
        quizRequired = false;
        quizSectionId = null;
      }
    }

    return {
      lessonState: updatedProgress.lessonState as progressStateEnum,
      nextLessonUnlocked,
      nextLesson,
      sectionCompleted,
      quizRequired,
      quizSectionId,
    };
  }
}
