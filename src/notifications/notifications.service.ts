import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationDocument } from './schema/notification.schema';
import { NotificationSerializer } from './serializers/notification.serializer';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name) private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  async markAsRead(notificationId: string, userId: string): Promise<NotificationSerializer> {
    const updated = await this.notificationModel.findOneAndUpdate(
      { _id: new Types.ObjectId(notificationId), userId: new Types.ObjectId(userId) },
      { $set: { isRead: true } },
      { new: true }
    ).exec();

    if (!updated) {
      throw new NotFoundException('Notification not found or unauthorized');
    }

    return new NotificationSerializer(updated.toObject() as any);
  }

  async markAllAsRead(userId: string): Promise<{ updatedCount: number }> {
    const result = await this.notificationModel.updateMany(
      { userId: new Types.ObjectId(userId), isRead: false },
      { $set: { isRead: true } }
    ).exec();

    return { updatedCount: result.modifiedCount };
  }
}
