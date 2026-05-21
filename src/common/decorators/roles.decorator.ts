import { SetMetadata } from '@nestjs/common';
import { Role } from '../../user/role.enum';

/** Metadata key used by {@link RolesGuard} to read allowed roles. */
export const ROLES_KEY = 'roles';

/**
 * Restricts access to the decorated handler (or controller) to users
 * whose JWT-embedded role is included in the provided list.
 *
 * @example `@Roles(Role.ADMIN)` — only administrators may call this route.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
