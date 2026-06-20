import { Controller, Get, Patch, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { AdminUsersService } from '../services/admin-users.service';
import { AdminUsersFilterDto } from '../dto/admin-users-filter.dto';
import { DeactivateUserDto } from '../dto/deactivate-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { AdminUserListResponse, UserStatusChangeResponse } from '../../common/interfaces/frontend-contracts';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  async getUsers(@Query() query: AdminUsersFilterDto): Promise<AdminUserListResponse> {
    return this.adminUsersService.getUsers(query);
  }

  @Patch(':id/deactivate')
  async deactivateUser(
    @Param('id') id: string,
    @Body() dto: DeactivateUserDto,
    @Request() req: any
  ): Promise<UserStatusChangeResponse> {
    return this.adminUsersService.deactivateUser(id, req.user.userId, dto);
  }

  @Patch(':id/reactivate')
  async reactivateUser(@Param('id') id: string, @Request() req: any): Promise<UserStatusChangeResponse> {
    return this.adminUsersService.reactivateUser(id, req.user.userId);
  }
}
