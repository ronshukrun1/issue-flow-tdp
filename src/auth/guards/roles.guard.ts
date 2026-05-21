import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../user/role.enum';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

/**
 * Authorisation guard that enforces the `@Roles()` decorator.
 *
 * Reads the user's role from `request.user.role` (set by the JWT
 * strategy) and checks it against the allowed roles attached via
 * metadata. If no `@Roles()` decorator is present the route is
 * open to any authenticated user.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  /**
   * @returns `true` when the user's role is permitted, otherwise throws.
   * @throws {ForbiddenException} When the user lacks the required role.
   */
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: { role: Role };
    }>();

    const userRole = request.user?.role;
    if (!userRole || !requiredRoles.includes(userRole)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
