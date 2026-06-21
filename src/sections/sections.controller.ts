import {
  Controller,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Get,
} from '@nestjs/common';
import { SectionsService } from './sections.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UpdateSectionDto } from './dto/update-section.dto';
import { ApiResponse } from '../common/interfaces/api-response.interface';
import { SectionResponse } from './interfaces/section-response.interface';
import { ReorderSectionsDto } from './dto/reorder-section.dto';

@Controller('courses/:id/sections')
export class SectionsController {
  constructor(private readonly sectionsService: SectionsService) { }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Post()
  async addSection(
    @Param('id') id: string,
    @Body() createSectionDto: CreateSectionDto,
    @CurrentUser() user: { userId: string },
  ): Promise<ApiResponse<SectionResponse[]>> {
    const instructorId = user?.userId;
    const sections = await this.sectionsService.addSection(id, instructorId, createSectionDto);
    return { success: true, data: sections };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Patch('reorder')
  reorderSections(
    @Param('id') courseId: string,
    @Body() dto: ReorderSectionsDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.sectionsService.reorderSections(
      courseId,
      user.userId,
      dto.sectionIds,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Patch(':sectionId')
  async updateSection(
    @Param('id') courseId: string,
    @Param('sectionId') sectionId: string,
    @Body() updateSection: UpdateSectionDto,
    @CurrentUser() user: { userId: string },
  ): Promise<ApiResponse<SectionResponse[]>> {
    const instructorId = user?.userId;
    const sections = await this.sectionsService.updateSection(
      courseId,
      sectionId,
      instructorId,
      updateSection,
    );
    return { success: true, data: sections };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Delete(':sectionId')
  async removeSection(
    @Param('id') courseId: string,
    @Param('sectionId') sectionId: string,
    @CurrentUser() user: { userId: string },
  ): Promise<ApiResponse<SectionResponse[]>> {
    const instructorId = user?.userId;
    const sections = await this.sectionsService.removeSection(courseId, sectionId, instructorId);
    return {
      success: true,
      message: 'Section has been removed successfully from the course',
      data: sections
    };
  }

  // Phase 9: Get purchase info for a section
  @UseGuards(JwtAuthGuard)
  @Get(':sectionId/purchase-info')
  async getPurchaseInfo(
    @Param('sectionId') sectionId: string,
    @CurrentUser() user: { userId: string }
  ) {
    return this.sectionsService.getPurchaseInfo(sectionId, user.userId);
  }

  // Phase 9: Set price for a section
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Patch(':sectionId/price')
  async setPrice(
    @Param('id') courseId: string,
    @Param('sectionId') sectionId: string,
    @Body('price') price: number | null,
    @CurrentUser() user: { userId: string }
  ) {
    return this.sectionsService.setPrice(courseId, sectionId, user.userId, price);
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
