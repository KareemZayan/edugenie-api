import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Note } from './schema/note.schema';
import { CreateNoteDto } from './dto/create-note.dto';
import { NoteResponse } from './interfaces/note-response.interface';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { Course } from '../courses/schema/course.schema';

@Injectable()
export class NotesService {
  constructor(
    @InjectModel(Note.name) private noteModel: Model<Note>,
    @InjectModel(Course.name) private courseModel: Model<Course>,
    private enrollmentsService: EnrollmentsService,
  ) {}

  async createNote(
    lessonId: string,
    dto: CreateNoteDto,
    studentId: string,
  ): Promise<NoteResponse> {
    const hasAccess = await this.enrollmentsService.canAccessLesson(
      studentId,
      lessonId,
    );
    if (!hasAccess) {
      throw new ForbiddenException(
        'You must be enrolled in this course to view this lesson',
      );
    }

    const course = await this.courseModel.findOne({
      'sections.lessons._id': new Types.ObjectId(lessonId),
    });
    if (!course) {
      throw new NotFoundException('Lesson not found');
    }

    const note = await this.noteModel.create({
      studentId: new Types.ObjectId(studentId),
      lessonId: new Types.ObjectId(lessonId),
      content: dto.content,
    });

    return {
      _id: note._id.toString(),
      content: note.content,
      createdAt: note.createdAt as Date,
    };
  }

  async getNotesForLesson(
    lessonId: string,
    studentId: string,
  ): Promise<{ notes: NoteResponse[] }> {
    const hasAccess = await this.enrollmentsService.canAccessLesson(
      studentId,
      lessonId,
    );
    if (!hasAccess) {
      throw new ForbiddenException(
        'You must be enrolled in this course to view this lesson',
      );
    }

    const notes = await this.noteModel
      .find({
        studentId: new Types.ObjectId(studentId),
        lessonId: new Types.ObjectId(lessonId),
      })
      .sort({ timestamp: 1 })
      .select('_id content timestamp createdAt')
      .exec();

    return {
      notes: notes.map((note) => ({
        _id: note._id.toString(),
        content: note.content,
        createdAt: note.createdAt as Date,
      })),
    };
  }
}
