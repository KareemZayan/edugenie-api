import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerApiResponse,
  ApiParam,
  ApiCookieAuth,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
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
@ApiTags('Reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get('course/:courseId')
  @ApiOperation({ summary: 'Get course reviews' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiParam({ name: 'courseId', type: String })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  async getCourseReviews(
    @Param('courseId') courseId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: { userId: string },
  ): Promise<
    ApiResponse<PaginatedResponse<ReviewSerializer> & { hasReviewed: boolean }>
  > {
    const result = await this.reviewsService.getCourseReviews(
      courseId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
      user?.userId,
    );
    return { success: true, data: result };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @Post()
  @ApiOperation({ summary: 'Create review' })
  @SwaggerApiResponse({ status: 201, description: 'Created successfully.' })
  @SwaggerApiResponse({ status: 400, description: 'Bad Request.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiBody({ type: CreateReviewDto })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async createReview(
    @Body() dto: CreateReviewDto,
    @CurrentUser() user: { userId: string },
  ): Promise<ApiResponse<ReviewSerializer>> {
    const review = await this.reviewsService.createReview(user.userId, dto);
    return {
      success: true,
      data: review,
      message: 'Review submitted successfully.',
    };
  }
}
