import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Param,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerApiResponse,
  ApiCookieAuth,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
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
@ApiTags('Users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  @ApiOperation({ summary: 'Get profile' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  async getProfile(
    @CurrentUser() user: { userId: string },
  ): Promise<ApiResponse<UserResponse>> {
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
  @ApiOperation({ summary: 'Update profile' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiBody({ type: UpdateUserDto })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
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

  @Patch('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change user password' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({
    status: 200,
    description: 'Password changed successfully',
  })
  @SwaggerApiResponse({ status: 401, description: 'Current password is incorrect' })
  async changePassword(
    @CurrentUser() user: { userId: string },
    @Body() dto: ChangePasswordDto,
  ): Promise<ApiResponse<{ message: string }>> {
    await this.usersService.changePassword(
      user.userId,
      dto.currentPassword,
      dto.newPassword,
    );
    return {
      success: true,
      data: { message: 'Password changed successfully' },
    };
  }

  @Patch(':id/role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Change user role' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: ChangeUserRoleDto })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
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
