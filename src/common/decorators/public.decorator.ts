import { SetMetadata } from '@nestjs/common';

/** Metadata key used by the global JWT guard to identify public routes. */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a controller method (or entire controller) as publicly accessible,
 * bypassing the global JWT authentication guard.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
