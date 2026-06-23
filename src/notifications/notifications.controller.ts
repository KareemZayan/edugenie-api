import { Controller, Patch, Param, UseGuards, Get, Delete, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiResponse } from '../common/interfaces/api-response.interface';
import { NotificationSerializer } from './serializers/notification.serializer';
import { PaginateQueryDto } from '../common/dto/paginate-query.dto';
import { NotificationListResponse, UnreadCountResponse } from '../common/interfaces/frontend-contracts';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Patch('mark-all-read')
  async markAllAsRead(
    @CurrentUser() user: { userId: string },
  ): Promise<ApiResponse<{ updatedCount: number }>> {
    const result = await this.notificationsService.markAllAsRead(user.userId);
    return { success: true, data: result, message: 'All notifications marked as read' };
  }

  @Patch(':id/read')
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ): Promise<ApiResponse<NotificationSerializer>> {
    const notification = await this.notificationsService.markAsRead(id, user.userId);
    return { success: true, data: notification, message: 'Notification marked as read' };
  }

  @Get()
  async getNotifications(
    @Query() query: PaginateQueryDto,
    @CurrentUser() user: { userId: string },
  ): Promise<ApiResponse<NotificationListResponse>> {
    const result = await this.notificationsService.getNotifications(user.userId, query);
    return { success: true, data: result };
  }

  // @Get('unread-count')
  // async getUnreadCount(
  //   @CurrentUser() user: { userId: string },
  // ): Promise<ApiResponse<UnreadCountResponse>> {
  //   const result = await this.notificationsService.getUnreadCount(user.userId);
  //   return { success: true, data: result };
  // }

  @Delete(':id')
  async deleteNotification(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ): Promise<ApiResponse<{ deleted: boolean }>> {
    const result = await this.notificationsService.deleteNotification(id, user.userId);
    return { success: true, data: result, message: 'Notification deleted' };
  }

  @Delete()
  async deleteAllNotifications(
    @CurrentUser() user: { userId: string },
  ): Promise<ApiResponse<{ deletedCount: number }>> {
    const result = await this.notificationsService.deleteAllNotifications(user.userId);
    return { success: true, data: result, message: 'All notifications deleted' };
  }
}
