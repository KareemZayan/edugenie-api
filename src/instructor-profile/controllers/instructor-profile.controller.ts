import { 
  Controller, 
  Get, 
  Patch, 
  Body, 
  Param, 
  UseGuards, 
  Req, 
  Query, 
  UseInterceptors, 
  UploadedFile, 
  HttpCode, 
  HttpStatus 
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { InstructorProfileService } from '../services/instructor-profile.service';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { InstructorRoleGuard } from '../guards/instructor-role.guard';
import { PROFILE_MESSAGES } from '../constants';
import { CourseStatus } from '../../courses/enums/status.enum';
import { ApiResponse } from '../interfaces/instructor-profile.interface';

@ApiTags('Instructor Profile')
@Controller('instructor/profile')
export class InstructorProfileController {
  constructor(private readonly service: InstructorProfileService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard, InstructorRoleGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current instructor profile' })
  async getMyProfile(@Req() req: any): Promise<ApiResponse<any>> {
    const data = await this.service.getMyProfile(req.user.id || req.user._id);
    return {
      success: true,
      message: PROFILE_MESSAGES.PROFILE_FETCHED,
      data,
    };
  }

  @Patch()
  @UseGuards(JwtAuthGuard, InstructorRoleGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update instructor profile' })
  async updateProfile(
    @Req() req: any,
    @Body() dto: UpdateProfileDto,
  ): Promise<ApiResponse<any>> {
    const data = await this.service.updateProfile(req.user.id || req.user._id, dto);
    return {
      success: true,
      message: PROFILE_MESSAGES.UPDATED_SUCCESSFULLY,
      data,
    };
  }

  @Patch('avatar')
  @UseGuards(JwtAuthGuard, InstructorRoleGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload instructor avatar' })
  async uploadAvatar(
    @Req() req: any,
    @UploadedFile() file: any,
  ): Promise<ApiResponse<any>> {
    const data = await this.service.uploadAvatar(req.user.id || req.user._id, file);
    return {
      success: true,
      message: PROFILE_MESSAGES.AVATAR_UPLOADED,
      data,
    };
  }

  @Patch('change-password')
  @UseGuards(JwtAuthGuard, InstructorRoleGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change instructor password' })
  async changePassword(
    @Req() req: any,
    @Body() dto: ChangePasswordDto,
  ): Promise<ApiResponse<null>> {
    await this.service.changePassword(req.user.id || req.user._id, dto);
    return {
      success: true,
      message: PROFILE_MESSAGES.PASSWORD_CHANGED,
      data: null,
    };
  }

  @Get('dashboard/stats')
  @UseGuards(JwtAuthGuard, InstructorRoleGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get instructor statistics' })
  async getStats(@Req() req: any): Promise<ApiResponse<any>> {
    const data = await this.service.getInstructorStats(req.user.id || req.user._id);
    return {
      success: true,
      message: PROFILE_MESSAGES.STATS_FETCHED,
      data,
    };
  }

  @Get('my-courses')
  @UseGuards(JwtAuthGuard, InstructorRoleGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get instructor courses' })
  async getMyCourses(
    @Req() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('status') status?: CourseStatus,
  ): Promise<ApiResponse<any>> {
    const data = await this.service.getMyCourses(
      req.user.id || req.user._id,
      parseInt(page, 10),
      parseInt(limit, 10),
      status,
    );
    return {
      success: true,
      message: PROFILE_MESSAGES.COURSES_FETCHED,
      data,
    };
  }

  @Get('reviews')
  @UseGuards(JwtAuthGuard, InstructorRoleGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get instructor reviews' })
  async getReviews(
    @Req() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ): Promise<ApiResponse<any>> {
    const data = await this.service.getMyReviews(
      req.user.id || req.user._id,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
    return {
      success: true,
      message: PROFILE_MESSAGES.REVIEWS_FETCHED,
      data,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get public instructor profile' })
  async getPublicProfile(@Param('id') id: string): Promise<ApiResponse<any>> {
    const data = await this.service.getPublicProfile(id);
    return {
      success: true,
      message: PROFILE_MESSAGES.PROFILE_FETCHED,
      data,
    };
  }
}
