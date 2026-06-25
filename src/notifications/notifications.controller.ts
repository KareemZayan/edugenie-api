import {
  Controller,
  Patch,
  Param,
  UseGuards,
  Get,
  Delete,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerApiResponse,
  ApiCookieAuth,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiResponse } from '../common/interfaces/api-response.interface';
import { NotificationSerializer } from './serializers/notification.serializer';
import { PaginateQueryDto } from '../common/dto/paginate-query.dto';
import {
  NotificationListResponse,
  UnreadCountResponse,
} from '../common/interfaces/frontend-contracts';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
@ApiTags('Notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Patch('mark-all-read')
  @ApiOperation({ summary: 'Mark all as read' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  async markAllAsRead(
    @CurrentUser() user: { userId: string },
  ): Promise<ApiResponse<{ updatedCount: number }>> {
    const result = await this.notificationsService.markAllAsRead(user.userId);
    return {
      success: true,
      data: result,
      message: 'All notifications marked as read',
    };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark as read' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiParam({ name: 'id', type: String })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ): Promise<ApiResponse<NotificationSerializer>> {
    const notification = await this.notificationsService.markAsRead(
      id,
      user.userId,
    );
    return {
      success: true,
      data: notification,
      message: 'Notification marked as read',
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get notifications' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  async getNotifications(
    @Query() query: PaginateQueryDto,
    @CurrentUser() user: { userId: string },
  ): Promise<ApiResponse<NotificationListResponse>> {
    const result = await this.notificationsService.getNotifications(
      user.userId,
      query,
    );
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
  @ApiOperation({ summary: 'Delete notification' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiParam({ name: 'id', type: String })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  async deleteNotification(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ): Promise<ApiResponse<{ deleted: boolean }>> {
    const result = await this.notificationsService.deleteNotification(
      id,
      user.userId,
    );
    return { success: true, data: result, message: 'Notification deleted' };
  }

  @Delete()
  @ApiOperation({ summary: 'Delete all notifications' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  async deleteAllNotifications(
    @CurrentUser() user: { userId: string },
  ): Promise<ApiResponse<{ deletedCount: number }>> {
    const result = await this.notificationsService.deleteAllNotifications(
      user.userId,
    );
    return {
      success: true,
      data: result,
      message: 'All notifications deleted',
    };
  }
}
