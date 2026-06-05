import {
  Controller,
  Get,
  Patch,
  Body,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@CurrentUser() user: { userId: string }) {
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
  async updateProfile(
    @CurrentUser() user: { userId: string },
    @Body() updateUserDto: UpdateUserDto,
  ) {
    const userId = user.userId;
    const updatedProfile = await this.usersService.updateProfile(
      userId,
      updateUserDto,
    );

    return {
      success: true,
      message: 'Profile updated successfully',
      data: updatedProfile,
    };
  }
}
