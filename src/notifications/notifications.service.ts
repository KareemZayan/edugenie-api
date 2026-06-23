import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Notification,
  NotificationDocument,
} from './schema/notification.schema';
import { NotificationSerializer } from './serializers/notification.serializer';
import { NotificationType } from './enums/notification-type.enum';
import { PaginateQueryDto } from '../common/dto/paginate-query.dto';
import {
  NotificationListResponse,
  UnreadCountResponse,
} from '../common/interfaces/frontend-contracts';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  async markAsRead(
    notificationId: string,
    userId: string,
  ): Promise<NotificationSerializer> {
    const updated = await this.notificationModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(notificationId),
          userId: new Types.ObjectId(userId),
        },
        { $set: { isRead: true } },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Notification not found or unauthorized');
    }

    return new NotificationSerializer(updated.toObject() as any);
  }

  async markAllAsRead(userId: string): Promise<{ updatedCount: number }> {
    const result = await this.notificationModel
      .updateMany(
        { userId: new Types.ObjectId(userId), isRead: false },
        { $set: { isRead: true } },
      )
      .exec();

    return { updatedCount: result.modifiedCount };
  }

  async create(
    userId: Types.ObjectId | string,
    title: string,
    message: string,
    type: NotificationType,
    courseId?: string,
  ): Promise<NotificationDocument> {
    return this.notificationModel.create({
      userId: new Types.ObjectId(userId),
      title,
      message,
      type,
      courseId,
      isRead: false,
    });
  }

  async getNotifications(
    userId: string,
    query: PaginateQueryDto,
  ): Promise<NotificationListResponse> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;
    const userObjectId = new Types.ObjectId(userId);

    const [notifications, total, unreadCount] = await Promise.all([
      this.notificationModel
        .find({ userId: userObjectId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.notificationModel.countDocuments({ userId: userObjectId }).exec(),
      this.notificationModel
        .countDocuments({ userId: userObjectId, isRead: false })
        .exec(),
    ]);

    return {
      data: notifications.map(
        (n) => new NotificationSerializer(n.toObject() as any),
      ),
      unreadCount,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    };
  }

  async getUnreadCount(userId: string): Promise<UnreadCountResponse> {
    const unreadCount = await this.notificationModel
      .countDocuments({
        userId: new Types.ObjectId(userId),
        isRead: false,
      })
      .exec();
    return { unreadCount };
  }

  async deleteNotification(
    notificationId: string,
    userId: string,
  ): Promise<{ deleted: boolean }> {
    const result = await this.notificationModel
      .findOneAndDelete({
        _id: new Types.ObjectId(notificationId),
        userId: new Types.ObjectId(userId),
      })
      .exec();

    if (!result) {
      throw new NotFoundException('Notification not found or unauthorized');
    }

    return { deleted: true };
  }

  async deleteAllNotifications(
    userId: string,
  ): Promise<{ deletedCount: number }> {
    const result = await this.notificationModel
      .deleteMany({
        userId: new Types.ObjectId(userId),
      })
      .exec();

    return { deletedCount: result.deletedCount };
  }
}
