import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RemediationService } from './remediation.service';

@UseGuards(JwtAuthGuard, ThrottlerGuard)
@Throttle({ default: { limit: 30, ttl: 3_600_000 } })
@ApiTags('Ai')
@Controller('ai/remediation')
export class RemediationController {
  constructor(private readonly remediation: RemediationService) {}

  @Get()
  @ApiOperation({ summary: "The user's active quiz-recovery plans" })
  @ApiBearerAuth()
  @ApiCookieAuth('jwt')
  list(@CurrentUser() user: { userId: string }) {
    return this.remediation.getActiveForUser(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one recovery plan' })
  @ApiBearerAuth()
  @ApiCookieAuth('jwt')
  getOne(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.remediation.getOne(user.userId, id);
  }
}
