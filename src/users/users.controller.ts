import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Param,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiResponse } from '../common/interfaces/api-response.interface';
import { UserResponse } from './interfaces/user-response.interface';
import { UserRole } from '../common/enums/user-role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ChangeUserRoleDto } from './dto/change-user-role.dto';
import { ChangeRoleResponse } from './interfaces/change-role-response.interface';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@CurrentUser() user: { userId: string }): Promise<ApiResponse<UserResponse>> {
    const userId = user.userId;
    const profile = await this.usersService.getProfile(userId);

    return {
      success: true,
      message: 'Profile retrieved successfully',
      data: profile,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  @UseInterceptors(FileInterceptor('profileImage'))
  async updateProfile(
    @CurrentUser() user: { userId: string },
    @Body() updateUserDto: UpdateUserDto,
    @UploadedFile() file?: any,
  ): Promise<ApiResponse<UserResponse>> {
    const userId = user.userId;
    const updatedProfile = await this.usersService.updateProfile(
      userId,
      updateUserDto,
      file,
    );

    return {
      success: true,
      message: 'Profile updated successfully',
      data: updatedProfile,
    };
  }

  @Patch(':id/role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  async changeUserRole(
    @Param('id') targetUserId: string,
    @Body() dto: ChangeUserRoleDto,
    @CurrentUser() currentUser: { userId: string },
  ): Promise<ChangeRoleResponse> {
    return this.usersService.changeUserRole(
      targetUserId,
      dto,
      currentUser.userId,
    );
  }
}
