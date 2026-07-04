import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
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
import { PusherService } from '../pusher/pusher.service';
import { User } from '../users/schema/user.schema';
import { MailService } from '../mail/mail.service';
import {
  NOTIFICATION_EMAIL_MAP,
  resolveNotificationCta,
} from './notification-email.config';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    private readonly pusherService: PusherService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
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
    const userIdStr = userId.toString();
    console.log(`[NOTIFICATION] Creating notification for user ${userIdStr}, type: ${type}`);
    
    const notification = await this.notificationModel.create({
      userId: new Types.ObjectId(userId),
      title,
      message,
      type,
      courseId,
      isRead: false,
    });

    console.log(`[NOTIFICATION] Notification created with ID ${notification._id}, triggering Pusher on channel user-${userIdStr}`);
    
    // 👇 push it in real time to the user's channel
    try {
      await this.pusherService.trigger(
        `user-${userIdStr}`,
        'new-notification',
        new NotificationSerializer(notification.toObject() as any),
      );
      console.log(`[NOTIFICATION] Pusher trigger SUCCESS for user ${userIdStr}`);
    } catch (err) {
      console.error(`[NOTIFICATION] Pusher trigger FAILED for user ${userIdStr}:`, err);
    }

    // 👇 fan the same event out to email (Phase 3). Awaited so the send
    // actually completes on serverless (Vercel), but fully guarded so a mail
    // failure can never break the in-app notification.
    await this.dispatchEmail(userIdStr, title, message, type, courseId);

    return notification;
  }

  /**
   * Emails the recipient for events flagged in {@link NOTIFICATION_EMAIL_MAP}.
   * Never throws — any lookup/send error is logged and swallowed. Skips quietly
   * when the event isn't email-enabled, no mail provider is configured, or the
   * user has no email on file.
   */
  private async dispatchEmail(
    userId: string,
    title: string,
    message: string,
    type: NotificationType,
    courseId?: string,
  ): Promise<void> {
    try {
      const rule = NOTIFICATION_EMAIL_MAP[type];
      if (!rule?.email) return; // event isn't email-enabled
      if (!this.mailService.isConfigured) return; // no provider (e.g. local dev)

      const user = await this.userModel
        .findById(userId)
        .select('email firstName role')
        .lean<{ email?: string; firstName?: string; role?: string }>()
        .exec();
      if (!user?.email) return;

      // Phase 2 will additionally gate on user.emailPreferences[rule.category]
      // (SECURITY is always sent).

      const studentApp =
        this.configService.get<string>('STUDENT_APP_URL') ||
        'http://localhost:3000';
      const dashboard =
        this.configService.get<string>('DASHBOARD_URL') ||
        'http://localhost:4200';

      const cta = resolveNotificationCta(type, courseId, user.role ?? '', {
        studentApp,
        dashboard,
      });

      await this.mailService.sendNotificationEmail({
        to: user.email,
        firstName: user.firstName,
        subject: rule.subject ?? title,
        heading: title,
        message,
        cta,
      });
    } catch (err) {
      this.logger.error(
        `Notification email dispatch failed for user ${userId} (${type}): ${
          (err as Error)?.message
        }`,
      );
    }
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
