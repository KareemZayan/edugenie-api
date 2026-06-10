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

@Controller('courses/:id/sections')
export class SectionsController {
  constructor(private readonly sectionsService: SectionsService) {}

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
    @Body('title') title: string,
    @CurrentUser() user: { userId: string },
  ) {
    const instructorId = user?.userId;
    return this.sectionsService.updateSection(
      courseId,
      sectionId,
      instructorId,
      title,
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
