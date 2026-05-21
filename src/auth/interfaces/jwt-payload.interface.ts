import { Role } from '../../user/role.enum';

/**
 * Shape of the data encoded inside the JWT access token.
 */
export interface JwtPayload {
  /** User's primary key (`sub` is the standard JWT claim for subject). */
  sub: number;

  /** User's login handle. */
  username: string;

  /** User's authorisation role. */
  role: Role;
}
