import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerApiResponse,
  ApiParam,
  ApiCookieAuth,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { LessonsService } from './lessons.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { LessonDetailResponse } from './interfaces/lesson-detail-response.interface';
import { UserRole } from '../common/enums/user-role.enum';

@Controller('lessons')
@ApiTags('Student Lessons')
export class StudentLessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Get(':lessonId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Find one' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiParam({ name: 'lessonId', type: String })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async findOne(
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: { userId: string },
  ): Promise<LessonDetailResponse> {
    return this.lessonsService.findOneForStudent(lessonId, user.userId);
  }
}
