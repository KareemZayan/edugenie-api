import {
  Controller,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { SectionsService } from './sections.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserRole } from 'src/common/enums/user-role.enum';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UpdateSectionDto } from './dto/update-section.dto';

@Controller('courses/:id/sections')
export class SectionsController {
  constructor(private readonly sectionsService: SectionsService) { }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Post()
  addSection(
    @Param('id') id: string,
    @Body() createSectionDto: CreateSectionDto,
    @CurrentUser() user: { userId: string },
  ) {
    const instructorId = user?.userId;
    return this.sectionsService.addSection(id, instructorId, createSectionDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Patch(':sectionId')
  updateSection(
    @Param('id') courseId: string,
    @Param('sectionId') sectionId: string,
    @Body() updateSection: UpdateSectionDto,
    @CurrentUser() user: { userId: string },
  ) {
    const instructorId = user?.userId;
    return this.sectionsService.updateSection(
      courseId,
      sectionId,
      instructorId,
      updateSection,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Delete(':sectionId')
  async removeSection(
    @Param('id') courseId: string,
    @Param('sectionId') sectionId: string,
    @CurrentUser() user: { userId: string },
  ) {
    const instructorId = user?.userId;

    await this.sectionsService.removeSection(courseId, sectionId, instructorId);

    return {
      success: true,
      message: 'Section has been removed successfully from the course ',
    };
  }
}

// NOTE FOR FUTURE IMPLEMENTATION: When the quiz generation
// endpoint that merges lesson transcripts for a section is built,
// it MUST check that every lesson in the section has a transcript
// that is both non-null AND non-empty:
//   transcript !== null && transcript !== ''
// If any lesson fails this check, reject with a clear error
// listing which lessons are not ready:
//   throw new BadRequestException(
//     `Cannot generate quiz — transcripts still processing or
//      empty for: ${problemLessonTitles.join(', ')}`
//   )
// Lessons with an empty transcript (valid 'ready' state but no
// detected speech) should be reported to the instructor distinctly
// from lessons still pending — consider including which case
// applies for each lesson in the error response so the instructor
// knows whether to wait or to re-upload/re-check that video's audio.
