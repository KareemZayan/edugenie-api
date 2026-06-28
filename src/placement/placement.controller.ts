import { Controller, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiCookieAuth,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PlacementService } from './placement.service';
import { SubmitPlacementDto } from './dto/submit-placement.dto';

@UseGuards(JwtAuthGuard, ThrottlerGuard)
@Controller('placement')
@ApiTags('Placement')
@ApiCookieAuth('jwt')
@ApiBearerAuth()
export class PlacementController {
  constructor(private readonly placementService: PlacementService) {}

  @Post(':courseId/generate')
  // Generation is an AI call — keep it modestly rate-limited.
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @ApiOperation({
    summary: 'Generate an AI placement test for a course (pre-purchase)',
  })
  @ApiParam({ name: 'courseId', type: String })
  @ApiResponse({ status: 201, description: 'Questions (without answers).' })
  generate(
    @Param('courseId') courseId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.placementService.generate(courseId, user.userId);
  }

  @Post(':courseId/submit')
  @ApiOperation({
    summary: 'Submit answers; get per-section scores + buy recommendation',
  })
  @ApiParam({ name: 'courseId', type: String })
  submit(
    @Param('courseId') courseId: string,
    @Body() dto: SubmitPlacementDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.placementService.submit(courseId, user.userId, dto);
  }

  @Post(':courseId/add-recommended')
  @ApiOperation({
    summary: 'Add the recommended sections (or full course) to the cart',
  })
  @ApiParam({ name: 'courseId', type: String })
  addRecommended(
    @Param('courseId') courseId: string,
    @Body('attemptId') attemptId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.placementService.addRecommendedToCart(
      courseId,
      user.userId,
      attemptId,
    );
  }
}
