import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
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
import { UpdateRoadmapDto } from './dto/update-roadmap.dto';

@UseGuards(JwtAuthGuard, ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 3_600_000 } })
@ApiTags('Ai')
@Controller('ai/roadmap')
export class RoadmapController {
  constructor(private readonly roadmap: RoadmapService) {}

  @Get('quota')
  @ApiOperation({
    summary: "AI attempts left for the user's active roadmap (+ reset date)",
  })
  @ApiBearerAuth()
  @ApiCookieAuth('jwt')
  quota(@CurrentUser() user: { userId: string }) {
    return this.roadmap.quota(user.userId);
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

  // NOTE: must be declared BEFORE the ':id' route so 'active' isn't captured as an id.
  @Get('active')
  @ApiOperation({ summary: "Get the user's single active roadmap (or null)" })
  @ApiBearerAuth()
  @ApiCookieAuth('jwt')
  getActive(@CurrentUser() user: { userId: string }) {
    return this.roadmap.getActive(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one saved roadmap' })
  @ApiBearerAuth()
  @ApiCookieAuth('jwt')
  getOne(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.roadmap.getOne(user.userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit an active roadmap (remove/reorder/add items)' })
  @ApiBearerAuth()
  @ApiCookieAuth('jwt')
  update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateRoadmapDto,
  ) {
    return this.roadmap.update(user.userId, id, dto);
  }

  @Post(':id/save')
  @ApiOperation({ summary: 'Save the active draft to the profile (buy later)' })
  @ApiBearerAuth()
  @ApiCookieAuth('jwt')
  saveRoadmap(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.roadmap.save(user.userId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a roadmap' })
  @ApiBearerAuth()
  @ApiCookieAuth('jwt')
  remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.roadmap.remove(user.userId, id);
  }
}
