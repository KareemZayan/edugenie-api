import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ProgressService } from './progress.service';
import { TrackProgressDto } from './dto/track-progress.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ProgressResponse } from './interfaces/progress-response.interface';
import { UserRole } from 'src/common/enums/user-role.enum';

@Controller('progress')
export class ProgressController {
  constructor(private readonly progressService: ProgressService) { }

  @Post('lesson')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  async trackProgress(
    @Body() dto: TrackProgressDto,
    @CurrentUser() user: { userId: string },
  ): Promise<ProgressResponse> {
    return this.progressService.trackProgress(dto, user.userId);
  }
}
