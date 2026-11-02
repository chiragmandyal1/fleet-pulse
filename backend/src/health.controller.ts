import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/decorators.js';

/** Liveness for docker compose and the deploy pipeline. */
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  health() {
    return { ok: true };
  }
}
