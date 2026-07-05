import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { AttachmentsService } from './attachments.service';
import { CreateAttachmentDto } from './dto/create-attachment.dto';
import { UpdateAttachmentDto } from './dto/update-attachment.dto';
import { AttachmentSerializer } from './serializers/attachments.serializer';

interface RequestWithUser {
  user: { userId: string; email: string; role: UserRole };
}

interface RequestWithOptionalUser {
  user?: { userId: string; email?: string; role: UserRole };
}

@ApiTags('Attachments')
@Controller()
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) { }

  // ── Instructor: create ──────────────────────────────────────────────

  @Post('courses/:courseId/sections/:sectionId/lessons/:lessonId/attachments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a lesson-level attachment (instructor only)' })
  async addLessonAttachment(
    @Param('courseId') courseId: string,
    @Param('sectionId') sectionId: string,
    @Param('lessonId') lessonId: string,
    @Req() req: RequestWithUser,
    @Body() dto: CreateAttachmentDto,
  ): Promise<AttachmentSerializer> {
    return this.attachmentsService.create(
      courseId,
      sectionId,
      lessonId,
      req.user.userId,
      dto,
    );
  }

  // ── Instructor: read own attachments (course builder view) ─────────

  @Get('courses/:courseId/sections/:sectionId/lessons/:lessonId/attachments/manage')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List lesson attachments (instructor view)' })
  async listLessonAttachmentsForInstructor(
    @Param('courseId') courseId: string,
    @Param('sectionId') sectionId: string,
    @Param('lessonId') lessonId: string,
    @Req() req: RequestWithUser,
  ): Promise<AttachmentSerializer[]> {
    return this.attachmentsService.findByLessonForInstructor(
      courseId,
      sectionId,
      lessonId,
      req.user.userId,
    );
  }

  // ── Student / enrolled: read ────────────────────────────────────────

  @Get('courses/:courseId/sections/:sectionId/lessons/:lessonId/attachments')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List lesson attachments (enrolled students only)' })
  async listLessonAttachments(
    @Param('courseId') courseId: string,
    @Param('sectionId') sectionId: string,
    @Param('lessonId') lessonId: string,
    @Req() req: RequestWithOptionalUser,
  ): Promise<AttachmentSerializer[]> {
    return this.attachmentsService.findByLesson(
      courseId,
      sectionId,
      lessonId,
      req.user,
    );
  }

  // ── Instructor: update / delete ─────────────────────────────────────

  @Patch('attachments/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update an attachment (title, file replacement)' })
  async update(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
    @Body() dto: UpdateAttachmentDto,
  ): Promise<AttachmentSerializer> {
    return this.attachmentsService.update(id, req.user.userId, dto);
  }

  @Delete('attachments/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an attachment (and its Cloudinary asset)' })
  async remove(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
  ): Promise<{ message: string }> {
    return this.attachmentsService.remove(id, req.user.userId);
  }
}