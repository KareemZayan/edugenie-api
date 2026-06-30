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
      courseId,
      sectionId,
      req.user.userId,
      dto,
    );
  }

  // ── Instructor: read own attachments (course builder view) ─────────

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
      courseId,
      req.user.userId,
      sectionId,
    );
  }

  // ── Public / student: read ──────────────────────────────────────────

  @Get('courses/:courseId/sections/:sectionId/attachments')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List section-level attachments (public or enrolled)' })
  async listSectionAttachments(
    @Param('courseId') courseId: string,
    @Param('sectionId') sectionId: string,
    @Req() req: RequestWithOptionalUser,
  ): Promise<AttachmentSerializer[]> {
    return this.attachmentsService.findByParent(
      courseId,
      sectionId,
      req.user,
    );
  }

  // ── Instructor: update / delete ─────────────────────────────────────

  @Patch('attachments/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update an attachment (e.g. toggle visibility)' })
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