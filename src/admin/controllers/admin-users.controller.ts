import {
  Controller,
  Get,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerApiResponse,
  ApiQuery,
  ApiCookieAuth,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { AdminUsersService } from '../services/admin-users.service';
import { AdminUsersFilterDto } from '../dto/admin-users-filter.dto';
import { DeactivateUserDto } from '../dto/deactivate-user.dto';
import { BlockUserDto } from '../dto/block-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  AdminUserListResponse,
  UserStatusChangeResponse,
} from '../../common/interfaces/frontend-contracts';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
@Controller('admin/users')
@ApiTags('Admin Users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get users' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async getUsers(
    @Query() query: AdminUsersFilterDto,
  ): Promise<AdminUserListResponse> {
    return this.adminUsersService.getUsers(query);
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate user' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: DeactivateUserDto })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async deactivateUser(
    @Param('id') id: string,
    @Body() dto: DeactivateUserDto,
    @Request() req: any,
  ): Promise<UserStatusChangeResponse> {
    return this.adminUsersService.deactivateUser(id, req.user.userId, dto);
  }

  @Patch(':id/block')
  @ApiOperation({ summary: 'Block user' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: BlockUserDto })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async blockUser(
    @Param('id') id: string,
    @Body() dto: BlockUserDto,
    @Request() req: any,
  ): Promise<UserStatusChangeResponse> {
    return this.adminUsersService.blockUser(id, req.user.userId, dto);
  }

  @Patch(':id/reactivate')
  @ApiOperation({ summary: 'Reactivate user' })
  @SwaggerApiResponse({ status: 200, description: 'Success.' })
  @SwaggerApiResponse({ status: 409, description: 'Conflict.' })
  @ApiParam({ name: 'id', type: String })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized.' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  async reactivateUser(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<UserStatusChangeResponse> {
    return this.adminUsersService.reactivateUser(id, req.user.userId);
  }
}
