import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '../../users/schema/user.schema';
import { AuditLog, AuditLogDocument } from '../../audit-logs/schemas/audit-log.schema';
import { Notification, NotificationDocument } from '../../notifications/schema/notification.schema';
import { UserStatus } from '../../common/enums/user-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { AdminUsersFilterDto } from '../dto/admin-users-filter.dto';
import { DeactivateUserDto } from '../dto/deactivate-user.dto';
import { AdminUserListResponse, UserStatusChangeResponse } from '../../common/interfaces/frontend-contracts';

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLogDocument>,
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
  ) {}

  async getUsers(query: AdminUsersFilterDto): Promise<AdminUserListResponse> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (query.role) {
      filter.role = query.role;
    }
    if (query.status) {
      filter.status = query.status;
    }
    if (query.search) {
      const searchRegex = new RegExp(query.search, 'i');
      filter.$or = [
        { email: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex },
      ];
    }

    const [users, total] = await Promise.all([
      this.userModel.find(filter)
        .select('-password -passwordReset')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.userModel.countDocuments(filter).exec()
    ]);

    const data = users.map((user) => ({
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      role: user.role,
      status: user.status,
      createdAt: (user as any).createdAt,
    }));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      }
    };
  }

  async deactivateUser(id: string, adminId: string, dto: DeactivateUserDto): Promise<UserStatusChangeResponse> {
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === UserRole.ADMIN || user.role === UserRole.SUPERADMIN) {
      throw new ForbiddenException('Admins cannot deactivate other admins');
    }

    if (user.status === UserStatus.DEACTIVATED) {
      throw new BadRequestException('User is already deactivated');
    }

    user.status = UserStatus.DEACTIVATED;
    user.deactivatedReason = dto.reason;
    user.deactivatedAt = new Date();
    user.deactivatedBy = new Types.ObjectId(adminId);
    await user.save();

    await this.auditLogModel.create({
      action: 'USER_DEACTIVATED',
      performedBy: new Types.ObjectId(adminId),
      targetUser: user._id,
      details: { reason: dto.reason },
    });

    // NOTE: Confirm whether deactivated users should be notified. 
    // Sending notification for now, assuming they can still access their notifications via email or if they are just blocked from certain actions.
    await this.notificationModel.create({
      userId: user._id,
      title: 'Account Deactivated',
      message: `Your account has been deactivated. Reason: ${dto.reason}`,
      type: 'USER_DEACTIVATED',
      isRead: false,
    });

    return {
      userId: user._id.toString(),
      status: UserStatus.DEACTIVATED,
      deactivatedBy: adminId,
      deactivatedAt: user.deactivatedAt,
    };
  }

  async reactivateUser(id: string, adminId: string): Promise<UserStatusChangeResponse> {
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.status !== UserStatus.DEACTIVATED) {
      throw new BadRequestException('User is not deactivated');
    }

    user.status = UserStatus.ACTIVE;
    user.deactivatedReason = null;
    user.deactivatedAt = null;
    user.deactivatedBy = null;
    await user.save();

    await this.auditLogModel.create({
      action: 'USER_REACTIVATED',
      performedBy: new Types.ObjectId(adminId),
      targetUser: user._id,
      details: {},
    });

    await this.notificationModel.create({
      userId: user._id,
      title: 'Account Reactivated',
      message: `Your account has been reactivated. Welcome back!`,
      type: 'USER_REACTIVATED',
      isRead: false,
    });

    return {
      userId: user._id.toString(),
      status: UserStatus.ACTIVE,
      reactivatedAt: new Date(),
    };
  }
}
