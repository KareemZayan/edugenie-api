import {
  Controller,
  Post,
  Get,
  Delete,
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
  ApiResponse as SwaggerApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { AttachmentsService } from './attachments.service';
import { CreateAttachmentDto } from './dto/create-attachment.dto';
import { AttachmentParentType } from './schema/attachment.schema';
import { AttachmentSerializer } from './serializers/attachments.serializer';

interface RequestWithUser {
  user: { userId: string; email: string; role: UserRole };
}

@ApiTags('Attachments')
@Controller()
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) { }

  // ── Instructor: create ──────────────────────────────────────────────

  @Post('courses/:courseId/attachments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a course-level attachment' })
  async addCourseAttachment(
    @Param('courseId') courseId: string,
    @Req() req: RequestWithUser,
    @Body() dto: CreateAttachmentDto,
  ): Promise<AttachmentSerializer> {
    return this.attachmentsService.create(
      AttachmentParentType.COURSE,
      courseId,
      req.user.userId,
      dto,
    );
  }

  @Post('courses/:courseId/sections/:sectionId/attachments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a section-level attachment' })
  async addSectionAttachment(
    @Param('courseId') courseId: string,
    @Param('sectionId') sectionId: string,
    @Req() req: RequestWithUser,
    @Body() dto: CreateAttachmentDto,
  ): Promise<AttachmentSerializer> {
    return this.attachmentsService.create(
      AttachmentParentType.SECTION,
      courseId,
      req.user.userId,
      dto,
      sectionId,
    );
  }

  @Post('courses/:courseId/sections/:sectionId/lessons/:lessonId/attachments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a lesson-level attachment' })
  async addLessonAttachment(
    @Param('courseId') courseId: string,
    @Param('sectionId') sectionId: string,
    @Param('lessonId') lessonId: string,
    @Req() req: RequestWithUser,
    @Body() dto: CreateAttachmentDto,
  ): Promise<AttachmentSerializer> {
    return this.attachmentsService.create(
      AttachmentParentType.LESSON,
      courseId,
      req.user.userId,
      dto,
      sectionId,
      lessonId,
    );
  }

  // ── Instructor: read own attachments (course builder view) ─────────

  @Get('courses/:courseId/attachments/manage')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List course-level attachments (instructor view)' })
  async listCourseAttachmentsForInstructor(
    @Param('courseId') courseId: string,
    @Req() req: RequestWithUser,
  ): Promise<AttachmentSerializer[]> {
    return this.attachmentsService.findByParentForInstructor(
      AttachmentParentType.COURSE,
      courseId,
      req.user.userId,
    );
  }

  @Get('courses/:courseId/sections/:sectionId/attachments/manage')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List section-level attachments (instructor view)' })
  async listSectionAttachmentsForInstructor(
    @Param('courseId') courseId: string,
    @Param('sectionId') sectionId: string,
    @Req() req: RequestWithUser,
  ): Promise<AttachmentSerializer[]> {
    return this.attachmentsService.findByParentForInstructor(
      AttachmentParentType.SECTION,
      courseId,
      req.user.userId,
      sectionId,
    );
  }

  @Get('courses/:courseId/sections/:sectionId/lessons/:lessonId/attachments/manage')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List lesson-level attachments (instructor view)' })
  async listLessonAttachmentsForInstructor(
    @Param('courseId') courseId: string,
    @Param('sectionId') sectionId: string,
    @Param('lessonId') lessonId: string,
    @Req() req: RequestWithUser,
  ): Promise<AttachmentSerializer[]> {
    return this.attachmentsService.findByParentForInstructor(
      AttachmentParentType.LESSON,
      courseId,
      req.user.userId,
      sectionId,
      lessonId,
    );
  }

  // ── Public / student: read ──────────────────────────────────────────

  @Get('courses/:courseId/attachments')
  @ApiOperation({ summary: 'List course-level attachments (public)' })
  async listCourseAttachments(
    @Param('courseId') courseId: string,
  ): Promise<AttachmentSerializer[]> {
    return this.attachmentsService.findByParent(
      AttachmentParentType.COURSE,
      courseId,
    );
  }

  @Get('courses/:courseId/sections/:sectionId/attachments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List section-level attachments (enrolled students only)' })
  async listSectionAttachments(
    @Param('courseId') courseId: string,
    @Param('sectionId') sectionId: string,
    @Req() req: RequestWithUser,
  ): Promise<AttachmentSerializer[]> {
    return this.attachmentsService.findByParent(
      AttachmentParentType.SECTION,
      courseId,
      sectionId,
      undefined,
      req.user.userId,
    );
  }

  @Get('courses/:courseId/sections/:sectionId/lessons/:lessonId/attachments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List lesson-level attachments (enrolled students only)' })
  async listLessonAttachments(
    @Param('courseId') courseId: string,
    @Param('sectionId') sectionId: string,
    @Param('lessonId') lessonId: string,
    @Req() req: RequestWithUser,
  ): Promise<AttachmentSerializer[]> {
    return this.attachmentsService.findByParent(
      AttachmentParentType.LESSON,
      courseId,
      sectionId,
      lessonId,
      req.user.userId,
    );
  }

  // ── Instructor: delete ──────────────────────────────────────────────

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