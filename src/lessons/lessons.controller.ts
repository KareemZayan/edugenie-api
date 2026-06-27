import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerApiResponse,
  ApiParam,
  ApiBody,
  ApiCookieAuth,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { LessonsService } from './lessons.service';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { ReorderLessonsDto } from './dto/reorder-lessons.dto';

@Controller('courses/:courseId/sections/:sectionId/lessons')
@ApiTags('Lessons')
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Post()
  @ApiOperation({ summary: 'Add lesson' })
  @SwaggerApiResponse({ status: 201, description: 'Created successfully.' })
  @SwaggerApiResponse({ status: 400, description: 'Bad Request.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiParam({ name: 'courseId', type: String })
  @ApiParam({ name: 'sectionId', type: String })
  @ApiBody({ type: CreateLessonDto })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  addLesson(
    @Param('courseId') courseId: string,
    @Param('sectionId') sectionId: string,
    @Body() createLessonDto: CreateLessonDto,
    @CurrentUser() user: { userId: string },
  ) {
    const instructorId = user?.userId;

    return this.lessonsService.addLesson(
      courseId,
      sectionId,
      instructorId,
      createLessonDto,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Get(':lessonId')
  @ApiOperation({ summary: 'Get lesson' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiParam({ name: 'courseId', type: String })
  @ApiParam({ name: 'sectionId', type: String })
  @ApiParam({ name: 'lessonId', type: String })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  getLesson(
    @Param('courseId') courseId: string,
    @Param('sectionId') sectionId: string,
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.lessonsService.getLessonById(
      courseId,
      sectionId,
      lessonId,
      user.userId,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Patch('reorder')
  @ApiOperation({ summary: 'Reorder lessons' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiParam({ name: 'courseId', type: String })
  @ApiParam({ name: 'sectionId', type: String })
  @ApiBody({ type: ReorderLessonsDto })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  reorderLessons(
    @Param('courseId') courseId: string,
    @Param('sectionId') sectionId: string,
    @Body() dto: ReorderLessonsDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.lessonsService.reorderLessons(
      courseId,
      sectionId,
      user.userId,
      dto.lessonIds,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Patch(':lessonId')
  @ApiOperation({ summary: 'Update lesson' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiParam({ name: 'courseId', type: String })
  @ApiParam({ name: 'sectionId', type: String })
  @ApiParam({ name: 'lessonId', type: String })
  @ApiBody({ type: UpdateLessonDto })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  updateLesson(
    @Param('courseId') courseId: string,
    @Param('sectionId') sectionId: string,
    @Param('lessonId') lessonId: string,
    @Body() updateLessonDto: UpdateLessonDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.lessonsService.updateLesson(
      courseId,
      sectionId,
      lessonId,
      user.userId,
      updateLessonDto,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Delete(':lessonId')
  @ApiOperation({ summary: 'Remove lesson' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiParam({ name: 'courseId', type: String })
  @ApiParam({ name: 'sectionId', type: String })
  @ApiParam({ name: 'lessonId', type: String })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  removeLesson(
    @Param('courseId') courseId: string,
    @Param('sectionId') sectionId: string,
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.lessonsService.removeLesson(
      courseId,
      sectionId,
      lessonId,
      user.userId,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.INSTRUCTOR)
  @Get(':lessonId/transcription-status')
  @ApiOperation({ summary: 'Get transcription status' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiParam({ name: 'courseId', type: String })
  @ApiParam({ name: 'sectionId', type: String })
  @ApiParam({ name: 'lessonId', type: String })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  getTranscriptionStatus(
    @Param('courseId') courseId: string,
    @Param('sectionId') sectionId: string,
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.lessonsService.getTranscriptionStatus(
      courseId,
      sectionId,
      lessonId,
      user.userId,
    );
  }
}
