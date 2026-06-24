import {
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from './schema/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { v2 as cloudinary } from 'cloudinary';
import { UserSerializer } from './serializers/user.serializer';
import { UserRole } from '../common/enums/user-role.enum';
import { Notification, NotificationDocument } from '../notifications/schema/notification.schema';
import { AuditLog, AuditLogDocument } from '../audit-logs/schemas/audit-log.schema';
import { ChangeUserRoleDto } from './dto/change-user-role.dto';
import { ChangeRoleResponse } from './interfaces/change-role-response.interface';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLogDocument>,
  ) {}

  async createUser(createUserDto: CreateUserDto): Promise<UserSerializer> {
    const existingUser = await this.userModel.findOne({
      email: createUserDto.email,
    });

    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    const newUser = new this.userModel(createUserDto);
    const savedUser = await newUser.save();
    return new UserSerializer(savedUser.toObject());
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email }).exec();
  }

  async findById(id: string | Types.ObjectId): Promise<User | null> {
    return this.userModel.findById(id).exec();
  }

  async getProfile(userId: string): Promise<UserSerializer> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return new UserSerializer(user.toObject());
  }

  async updateProfile(userId: string, updateUserDto: UpdateUserDto, file?: any): Promise<UserSerializer> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (file) {
      try {
        const result: any = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { folder: 'avatars' },
            (error, result) => {
              if (error) return reject(error);
              resolve(result);
            }
          ).end(file.buffer);
        });

        if (user.avatarPublicId) {
          try {
            await cloudinary.uploader.destroy(user.avatarPublicId);
          } catch (error) {
            Logger.error(
              `Failed to delete Cloudinary image: ${user.avatarPublicId}`,
              error instanceof Error ? error.stack : 'Unknown error',
              'UsersService'
            );
          }
        }

        updateUserDto.avatar = result.secure_url;
        updateUserDto.avatarPublicId = result.public_id;
      } catch (error) {
        throw new BadRequestException('Failed to upload image');
      }
    } else if (updateUserDto.avatar !== undefined) {
      // Check if user already has an avatar public ID
      if (user.avatarPublicId) {
        const isAvatarDeleted = updateUserDto.avatar === null;
        const isAvatarReplaced =
          updateUserDto.avatar !== null && updateUserDto.avatar !== user.avatar;

        // Delete the old image from Cloudinary if replacing or deleting
        if (isAvatarDeleted || isAvatarReplaced) {
          try {
            await cloudinary.uploader.destroy(user.avatarPublicId);
          } catch (error) {
            Logger.error(
              `Failed to delete Cloudinary image: ${user.avatarPublicId}`,
              error instanceof Error ? error.stack : 'Unknown error',
              'UsersService'
            );
          }
        }
      }

      if (
        updateUserDto.avatar === null &&
        updateUserDto.avatarPublicId === undefined
      ) {
        updateUserDto.avatarPublicId = null;
      }
    }

    const updatedUser = await this.userModel
      .findByIdAndUpdate(
        userId,
        { $set: updateUserDto },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }

    return new UserSerializer(updatedUser.toObject());
  }
  async changeUserRole(
    targetUserId: string,
    dto: ChangeUserRoleDto,
    requestingSuperAdminId: string,
  ): Promise<ChangeRoleResponse> {
    const targetUser = await this.userModel.findById(targetUserId);
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    if (targetUserId === requestingSuperAdminId) {
      throw new ForbiddenException('You cannot change your own role');
    }

    if (
      targetUser.role === UserRole.SUPERADMIN &&
      dto.newRole !== UserRole.SUPERADMIN
    ) {
      const superAdminCount = await this.userModel.countDocuments({
        role: UserRole.SUPERADMIN,
      });

      if (superAdminCount <= 1) {
        throw new ConflictException(
          'Cannot remove the last remaining superadmin. Promote another user to superadmin first.',
        );
      }
    }

    if (
      targetUser.role === UserRole.SUPERADMIN &&
      !dto.confirmSuperAdminChange
    ) {
      throw new BadRequestException(
        "Changing a superadmin's role requires explicit confirmation. Set confirmSuperAdminChange: true in the request body.",
      );
    }

    if (targetUser.role === dto.newRole) {
      throw new BadRequestException(`User already has the role ${dto.newRole}`);
    }

    const oldRole = targetUser.role;
    targetUser.role = dto.newRole;
    await targetUser.save();

    await this.auditLogModel.create({
      action: 'ROLE_CHANGE',
      performedBy: new Types.ObjectId(requestingSuperAdminId),
      targetUser: new Types.ObjectId(targetUserId),
      details: { oldRole, newRole: dto.newRole },
    });

    await this.notificationModel.create({
      userId: new Types.ObjectId(targetUserId),
      title: 'Role Changed',
      message: `Your account role has been changed from ${oldRole} to ${dto.newRole}`,
      type: 'ROLE_CHANGE',
      isRead: false,
    });

    return {
      id: targetUser._id.toString(),
      email: targetUser.email,
      firstName: targetUser.firstName,
      lastName: targetUser.lastName,
      oldRole,
      newRole: targetUser.role,
      changedAt: new Date(),
      changedBy: requestingSuperAdminId,
    };
  }
}
