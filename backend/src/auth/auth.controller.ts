import { BadRequestException, Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import type { AuthUser } from './auth.types.js';
import { CurrentUser, Public } from './decorators.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() body: unknown) {
    const { email, password } = (body ?? {}) as Record<string, unknown>;
    if (typeof email !== 'string' || typeof password !== 'string') {
      throw new BadRequestException('email and password are required');
    }
    return this.auth.login(email, password);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
