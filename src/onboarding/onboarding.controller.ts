import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OnboardingService } from './onboarding.service';
import { SubmitOnboardingDto } from './dto/submit-onboarding.dto';

@ApiTags('Onboarding')
@UseGuards(JwtAuthGuard)
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get()
  @ApiOperation({ summary: 'Onboarding status for the current user' })
  @ApiBearerAuth()
  @ApiCookieAuth('jwt')
  status(@CurrentUser() user: { userId: string }) {
    return this.onboarding.getStatus(user.userId);
  }

  @Post()
  @ApiOperation({
    summary: 'Submit one-time onboarding and generate the first roadmap (free)',
  })
  @ApiBearerAuth()
  @ApiCookieAuth('jwt')
  submit(
    @CurrentUser() user: { userId: string },
    @Body() dto: SubmitOnboardingDto,
  ) {
    return this.onboarding.submit(user.userId, dto);
  }

  @Post('generate-roadmap')
  @ApiOperation({
    summary: 'Retry the first roadmap from saved onboarding answers',
  })
  @ApiBearerAuth()
  @ApiCookieAuth('jwt')
  generateRoadmap(@CurrentUser() user: { userId: string }) {
    return this.onboarding.generateRoadmap(user.userId);
  }
}
