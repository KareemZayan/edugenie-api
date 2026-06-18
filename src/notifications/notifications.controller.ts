import { Controller, Patch, Param, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiResponse } from '../common/interfaces/api-response.interface';
import { NotificationSerializer } from './serializers/notification.serializer';

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
}
