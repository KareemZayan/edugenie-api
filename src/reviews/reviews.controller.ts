import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiResponse } from '../common/interfaces/api-response.interface';
import { PaginatedResponse } from '../common/interfaces/paginated-response.interface';
import { ReviewSerializer } from './serializers/review.serializer';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get('course/:courseId')
  async getCourseReviews(
    @Param('courseId') courseId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: { userId: string },
  ): Promise<ApiResponse<PaginatedResponse<ReviewSerializer> & { hasReviewed: boolean }>> {
    const result = await this.reviewsService.getCourseReviews(
      courseId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
      user?.userId
    );
    return { success: true, data: result };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @Post()
  async createReview(
    @Body() dto: CreateReviewDto,
    @CurrentUser() user: { userId: string },
  ): Promise<ApiResponse<ReviewSerializer>> {
    const review = await this.reviewsService.createReview(user.userId, dto);
    return { success: true, data: review, message: 'Review submitted successfully.' };
  }
}
