import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../users/schemas/user.schema';
import { ROLES_KEY } from '../decorators/roles.decorator';

interface RequestWithUser {
  user: {
    userId: string;
    email: string;
    role: UserRole;
  };
}
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 1. I return the roles requested by the decorator
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If there are no specific roles, allow access
    if (!requiredRoles) return true;

    // 2. Retrieve the user from the request
    const { user } = context.switchToHttp().getRequest<RequestWithUser>();
    // 3. Check that the user has the required role
    return requiredRoles.includes(user.role);
  }
}
