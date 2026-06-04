import { Controller, Get, Patch, Body, Request, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Request() req: any) {
    const userId = req.user.userId;
    const profile = await this.usersService.getProfile(userId);
    
    return {
      success: true,
      message: 'Profile retrieved successfully',
      data: profile,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  async updateProfile(@Request() req: any, @Body() updateUserDto: UpdateUserDto) {
    const userId = req.user.userId;
    const updatedProfile = await this.usersService.updateProfile(userId, updateUserDto);
    
    return {
      success: true,
      message: 'Profile updated successfully',
      data: updatedProfile,
    };
  }
}
