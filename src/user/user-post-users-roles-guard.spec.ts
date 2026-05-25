import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  RolesGuard,
  ROLES_FORBIDDEN_MESSAGE,
} from '../auth/guards/roles.guard';
import { UserController } from './user.controller';
import { Role } from './role.enum';

type AdminOnlyHandler = keyof Pick<UserController, 'create' | 'remove'>;

const ADMIN_ONLY_USER_CONTROLLER_HANDLERS: ReadonlyArray<{
  label: AdminOnlyHandler;
  handler: UserController['create'] | UserController['remove'];
}> = [
  { label: 'create', handler: UserController.prototype.create },
  { label: 'remove', handler: UserController.prototype.remove },
];

describe('RolesGuard + ADMIN-only User routes (@Roles ADMIN)', () => {
  let guard: RolesGuard;

  beforeEach(() => {
    guard = new RolesGuard(new Reflector());
  });

  describe.each(ADMIN_ONLY_USER_CONTROLLER_HANDLERS)(
    '$label',
    ({ handler }) => {
      function mockContext(role: Role | undefined): ExecutionContext {
        return {
          getHandler: () => handler,
          getClass: () => UserController,
          switchToHttp: () => ({
            getRequest: () =>
              role === undefined ? {} : { user: { userId: 1, role } },
          }),
        } as unknown as ExecutionContext;
      }

      it('allows ADMIN callers', () => {
        expect(guard.canActivate(mockContext(Role.ADMIN))).toBe(true);
      });

      it('throws ForbiddenException for DEVELOPER', () => {
        expect(() => guard.canActivate(mockContext(Role.DEVELOPER))).toThrow(
          new ForbiddenException(ROLES_FORBIDDEN_MESSAGE),
        );
      });

      it('throws ForbiddenException without authenticated user payload', () => {
        expect(() => guard.canActivate(mockContext(undefined))).toThrow(
          new ForbiddenException(ROLES_FORBIDDEN_MESSAGE),
        );
      });
    },
  );
});
