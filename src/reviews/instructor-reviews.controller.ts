import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
export class InstructorReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Roles(UserRole.INSTRUCTOR)
  @Get()
  async getReviews(
    @Query() filterDto: InstructorReviewsFilterDto,
    @CurrentUser() user: { userId: string },
  ): Promise<PaginatedResponse<InstructorReviewListItem>> {
    return this.reviewsService.findByInstructor(user.userId, filterDto as unknown as Record<string, unknown>);
  }
}
