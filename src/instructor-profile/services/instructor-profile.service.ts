import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { InstructorProfileRepository } from '../repositories/instructor-profile.repository';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { InstructorProfileMapper } from '../mappers/instructor-profile.mapper';
import { InstructorProfileResponse, InstructorStatsResponse } from '../interfaces/instructor-profile.interface';
import { CourseStatus } from '../../courses/enums/status.enum';

@Injectable()
export class InstructorProfileService {
  constructor(private readonly repository: InstructorProfileRepository) {}

  async getMyProfile(userId: string): Promise<InstructorProfileResponse> {
    const user = await this.repository.findUserById(userId);
    if (!user) {
      throw new NotFoundException('Instructor profile not found');
    }
    return InstructorProfileMapper.toProfileResponse(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<InstructorProfileResponse> {
    const updateData: any = { ...dto };
    
    if (dto.name) {
      const parts = dto.name.split(' ');
      updateData.firstName = parts[0];
      updateData.lastName = parts.slice(1).join(' ') || '';
      delete updateData.name;
    }

    const updatedUser = await this.repository.updateUserById(userId, updateData);
    if (!updatedUser) {
      throw new NotFoundException('Instructor profile not found');
    }

    return InstructorProfileMapper.toProfileResponse(updatedUser);
  }

  async uploadAvatar(userId: string, file: any): Promise<InstructorProfileResponse> {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    
    // Cloudinary integration logic would go here.
    // For now, we simulate by creating a mock URL or using the file path if it's local
    const avatarUrl = `https://mock-cloudinary.com/avatar/${file.filename || file.originalname}`;
    
    const updatedUser = await this.repository.updateUserById(userId, { avatar: avatarUrl });
    if (!updatedUser) {
      throw new NotFoundException('Instructor profile not found');
    }

    return InstructorProfileMapper.toProfileResponse(updatedUser);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.repository.findUserById(userId);
    if (!user) {
      throw new NotFoundException('Instructor profile not found');
    }

    const isMatch = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isMatch) {
      throw new BadRequestException('Invalid current password');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(dto.newPassword, salt);

    await this.repository.updateUserById(userId, { password: hashedPassword });
  }

  async getPublicProfile(id: string): Promise<Partial<InstructorProfileResponse>> {
    const user = await this.repository.findUserById(id);
    if (!user) {
      throw new NotFoundException('Instructor profile not found');
    }

    // Increment profile views
    await this.repository.incrementProfileViews(id);

    return InstructorProfileMapper.toPublicProfileResponse(user);
  }

  async getInstructorStats(userId: string): Promise<InstructorStatsResponse> {
    return this.repository.getInstructorStats(userId);
  }

  async getMyCourses(userId: string, page: number, limit: number, status?: CourseStatus): Promise<any> {
    const { courses, total } = await this.repository.getInstructorCourses(userId, page, limit, status);
    return {
      data: courses,
      total,
      page,
      limit,
    };
  }

  async getMyReviews(userId: string, page: number, limit: number): Promise<any> {
    const { averageRating, totalReviews, reviews } = await this.repository.getInstructorReviews(userId, page, limit);
    return {
      averageRating,
      totalReviews,
      data: reviews,
      total: totalReviews,
      page,
      limit,
    };
  }
}
