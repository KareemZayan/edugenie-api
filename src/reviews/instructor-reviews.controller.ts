import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerApiResponse,
  ApiQuery,
  ApiCookieAuth,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { InstructorReviewsFilterDto } from './dto/instructor-reviews-filter.dto';
import {
  PaginatedResponse,
  InstructorReviewListItem,
} from '../common/interfaces/frontend-contracts';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('instructor/reviews')
@ApiTags('Instructor Reviews')
export class InstructorReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Roles(UserRole.INSTRUCTOR)
  @Get()
  @ApiOperation({ summary: 'Get reviews' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getReviews(
    @Query() filterDto: InstructorReviewsFilterDto,
    @CurrentUser() user: { userId: string },
  ): Promise<PaginatedResponse<InstructorReviewListItem>> {
    return this.reviewsService.findByInstructor(
      user.userId,
      filterDto as unknown as Record<string, unknown>,
    );
  }
}
