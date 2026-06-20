import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';
import { Note, NoteSchema } from './schema/note.schema';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { Course, CourseSchema } from '../courses/schema/course.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Note.name, schema: NoteSchema },
      { name: Course.name, schema: CourseSchema },
    ]),
    EnrollmentsModule,
  ],
  controllers: [NotesController],
  providers: [NotesService],
})
export class NotesModule {}
