import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Progress } from './schema/progress.schema';
import { Course } from '../courses/schema/course.schema';
import { Quiz } from '../quizzes/schema/quiz.schema';
import { QuizAttempt } from '../quizzes/schema/quiz-attempt.schema';
import { TrackProgressDto } from './dto/track-progress.dto';
import { ProgressResponse } from './interfaces/progress-response.interface';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { Enrollment } from '../enrollments/schema/enrollment.schema';
import { computeCourseProgress } from '../common/utils/lesson-progress.util';

@Injectable()
export class ProgressService {
  constructor(
    @InjectModel(Progress.name) private progressModel: Model<Progress>,
    @InjectModel(Course.name) private courseModel: Model<Course>,
    @InjectModel(Quiz.name) private quizModel: Model<Quiz>,
    @InjectModel(QuizAttempt.name) private quizAttemptModel: Model<QuizAttempt>,
    @InjectModel(Enrollment.name) private enrollmentModel: Model<Enrollment>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async trackProgress(
    dto: TrackProgressDto,
    studentId: string,
  ): Promise<ProgressResponse> {
    const { lessonId, watchedDuration, isCompleted } = dto;
    const lessonObjectId = new Types.ObjectId(lessonId);

    // 1. Find the lesson to get its sectionId and courseId
    const course = await this.courseModel.findOne({
      'sections.lessons._id': lessonObjectId,
    });
    if (!course) {
      throw new NotFoundException('Lesson not found');
    }

    let foundSection = null;
    let foundLesson = null;
    let lessonIndex = -1;
    for (const section of course.sections) {
      lessonIndex = section.lessons.findIndex(
        (l) => l._id.toString() === lessonId,
      );
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
        },
      },
      { upsert: true, new: true },
    );

    // Persist completion onto the enrollment so it survives reloads and feeds
    // the player lock state, the "x/y done" counts, the coach, and "my courses".
    // Progress is scoped to what the student OWNS (their sections, or the whole
    // course) so a section-buyer can actually reach 100%.
    const enrollment = await this.enrollmentModel.findOne({
      studentId: new Types.ObjectId(studentId),
      courseId: course._id,
    });

    let courseProgress = 0;
    let completedInScope = 0;
    let scopeTotal = 0;

    if (enrollment) {
      enrollment.lastActivityAt = new Date();

      if (isCompleted) {
        const already = enrollment.completedLessons.some(
          (id) => id.toString() === lessonId,
        );
        if (!already) enrollment.completedLessons.push(lessonObjectId);
      }

      const progress = computeCourseProgress(course, enrollment);
      scopeTotal = progress.total;
      completedInScope = progress.completed;
      courseProgress = progress.percentage;

      const previousPercentage = enrollment.progressPercentage;
      enrollment.progressPercentage = courseProgress;

      // 50% milestone — fires once when crossing the halfway mark.
      if (
        previousPercentage < 50 &&
        courseProgress >= 50 &&
        !enrollment.milestone50Notified
      ) {
        enrollment.milestone50Notified = true;
        await this.notificationsService.create(
          studentId,
          "You're halfway there!",
          `You're 50% done with "${course.title}", keep it up!`,
          NotificationType.GOAL_MILESTONE,
          course._id.toString(),
        );
      }

      // 100% — graduation. Guard on the flag so the certificate fires only once.
      if (courseProgress === 100 && !enrollment.isCourseCompleted) {
        enrollment.isCourseCompleted = true;
        await this.notificationsService.create(
          studentId,
          'Certificate Earned!',
          `You have earned a certificate for completing "${course.title}".`,
          NotificationType.CERTIFICATE_EARNED,
          course._id.toString(),
        );
      }

      await enrollment.save();
    }

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
      }
    }

    // 4. Determine sectionCompleted
    const sectionLessonIds = foundSection.lessons.map((l) => l._id);
    const completedCount = await this.progressModel.countDocuments({
      studentId: new Types.ObjectId(studentId),
      lessonId: { $in: sectionLessonIds },
      isCompleted: true,
    });

    const allLessonsCompleted = completedCount === foundSection.lessons.length;

    // 5. Determine quizRequired & Section Completed Logic
    const quiz = await this.quizModel.findOne({ sectionId: foundSection._id });
    if (quiz) {
      quizRequired = true;
      quizSectionId = foundSection._id.toString();

      // Check if they passed the quiz
      const passedAttempt = await this.quizAttemptModel.findOne({
        studentId: new Types.ObjectId(studentId),
        quizId: quiz._id,
        passed: true,
      });

      if (allLessonsCompleted && passedAttempt) {
        sectionCompleted = true;
      } else {
        sectionCompleted = false;
      }
    } else {
      quizRequired = false;
      quizSectionId = null;
      if (allLessonsCompleted) {
        sectionCompleted = true;
      }
    }

    // 6. Check course completion (last section, no quiz)
    if (sectionCompleted && !quizRequired) {
      const lastSectionIndex = course.sections.length - 1;
      const isLastSection =
        course.sections[lastSectionIndex]._id.toString() ===
        foundSection._id.toString();

      if (isLastSection) {
        await this.notificationsService.create(
          studentId,
          'Course Completed!',
          `Congratulations! You have completed "${course.title}".`,
          NotificationType.COURSE_COMPLETED,
          course._id.toString(),
        );
      }
    }

    return {
      lessonState: updatedProgress.lessonState,
      nextLessonUnlocked,
      nextLesson,
      sectionCompleted,
      quizRequired,
      quizSectionId,
      courseProgress,
      completedLessons: completedInScope,
      totalLessons: scopeTotal,
    };
  }

  async markQuizPassed(studentId: string, sectionId: string) {
    const course = await this.courseModel.findOne({
      'sections._id': new Types.ObjectId(sectionId),
    });
    if (!course) {
      throw new NotFoundException('Course not found for section');
    }

    let currentSectionIndex = -1;
    let foundSection = null;
    for (let i = 0; i < course.sections.length; i++) {
      if (course.sections[i]._id.toString() === sectionId) {
        currentSectionIndex = i;
        foundSection = course.sections[i];
        break;
      }
    }

    if (!foundSection) {
      throw new NotFoundException('Section not found');
    }

    let nextSectionUnlocked = false;
    let isCourseCompleted = false;

    // A section is completed if all lessons are also completed.
    const sectionLessonIds = foundSection.lessons.map((l) => l._id);
    const completedCount = await this.progressModel.countDocuments({
      studentId: new Types.ObjectId(studentId),
      lessonId: { $in: sectionLessonIds },
      isCompleted: true,
    });

    if (completedCount === foundSection.lessons.length) {
      // All lessons watched AND now quiz passed!
      if (currentSectionIndex + 1 < course.sections.length) {
        nextSectionUnlocked = true;
      } else {
        isCourseCompleted = true;
      }
    }

    if (isCourseCompleted) {
      await this.notificationsService.create(
        studentId,
        'Course Completed!',
        `Congratulations! You have completed "${course.title}".`,
        NotificationType.COURSE_COMPLETED,
        course._id.toString(),
      );
    }

    return {
      nextSectionUnlocked,
      isCourseCompleted,
    };
  }
}
