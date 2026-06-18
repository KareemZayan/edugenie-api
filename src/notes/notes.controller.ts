import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { NotesService } from './notes.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { NoteResponse } from './interfaces/note-response.interface';
import { UserRole } from '../common/enums/user-role.enum';

@Controller('lessons')
export class NotesController {
  constructor(private readonly notesService: NotesService) { }

  @Post(':lessonId/notes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  async createNote(
    @Param('lessonId') lessonId: string,
    @Body() dto: CreateNoteDto,
    @CurrentUser() user: { userId: string },
  ): Promise<NoteResponse> {
    return this.notesService.createNote(lessonId, dto, user.userId);
  }

  @Get(':lessonId/notes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  async getNotes(
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: { userId: string },
  ): Promise<{ notes: NoteResponse[] }> {
    return this.notesService.getNotesForLesson(lessonId, user.userId);
  }
}
