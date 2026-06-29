import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RoadmapService } from './roadmap.service';
import { BuildRoadmapDto } from './dto/build-roadmap.dto';

@UseGuards(JwtAuthGuard, ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 3_600_000 } })
@ApiTags('Ai')
@Controller('ai/roadmap')
export class RoadmapController {
  constructor(private readonly roadmap: RoadmapService) {}

  @Get('quota')
  @ApiOperation({ summary: 'How many roadmap builds the user has left' })
  @ApiBearerAuth()
  @ApiCookieAuth('jwt')
  async quota(@CurrentUser() user: { userId: string }) {
    return { remaining: await this.roadmap.remaining(user.userId) };
  }

  @Post('build')
  @ApiOperation({ summary: 'Generate a structured, buyable learning roadmap' })
  @ApiBearerAuth()
  @ApiCookieAuth('jwt')
  build(
    @CurrentUser() user: { userId: string },
    @Body() dto: BuildRoadmapDto,
  ) {
    return this.roadmap.build(user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: "List the user's saved roadmaps" })
  @ApiBearerAuth()
  @ApiCookieAuth('jwt')
  list(@CurrentUser() user: { userId: string }) {
    return this.roadmap.list(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one saved roadmap' })
  @ApiBearerAuth()
  @ApiCookieAuth('jwt')
  getOne(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.roadmap.getOne(user.userId, id);
  }
}
