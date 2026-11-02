import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AuthUser, Role } from './auth.types.js';

export const IS_PUBLIC = 'isPublic';
export const ROLES_KEY = 'roles';

/** Skips the JWT check. Every route needs a token unless it says otherwise. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restricts a route to these roles. Without it, any signed-in role passes. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
