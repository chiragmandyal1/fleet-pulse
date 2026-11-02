import { BadRequestException, Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { DevicePatch, DevicesService, LINK_STATUSES, LinkStatus } from './devices.service.js';

/** History window in hours: default a day, capped at 30 days, which is how long the rollups are kept. */
export function parseHours(raw: string | undefined): number {
  if (raw === undefined) return 24;
  const hours = Number(raw);
  if (!Number.isInteger(hours) || hours < 1 || hours > 720) {
    throw new BadRequestException('hours must be an integer from 1 to 720');
  }
  return hours;
}

/** Only these fields are editable; anything else in the body is a client bug. */
export function parsePatch(body: unknown): DevicePatch {
  const { name, rfThreshold, ...rest } = (body ?? {}) as Record<string, unknown>;
  if (Object.keys(rest).length) {
    throw new BadRequestException(`not editable: ${Object.keys(rest).join(', ')}`);
  }
  const patch: DevicePatch = {};
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) throw new BadRequestException('name must be a non-empty string');
    patch.name = name.trim();
  }
  if (rfThreshold !== undefined) {
    if (typeof rfThreshold !== 'number' || !(rfThreshold >= 0 && rfThreshold <= 20)) {
      throw new BadRequestException('rfThreshold must be a number from 0 to 20 dB');
    }
    patch.rfThreshold = rfThreshold;
  }
  if (!Object.keys(patch).length) throw new BadRequestException('nothing to update');
  return patch;
}

@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
  ) {
    if (status !== undefined && !LINK_STATUSES.includes(status as LinkStatus)) {
      throw new BadRequestException(`status must be one of ${LINK_STATUSES.join(', ')}`);
    }
    return this.devices.list(user, { customerId, status: status as LinkStatus | undefined });
  }

  @Get(':deviceId')
  findOne(@CurrentUser() user: AuthUser, @Param('deviceId') deviceId: string) {
    return this.devices.findOne(user, deviceId);
  }

  @Get(':deviceId/telemetry')
  telemetry(
    @CurrentUser() user: AuthUser,
    @Param('deviceId') deviceId: string,
    @Query('hours') hours?: string,
  ) {
    return this.devices.telemetry(user, deviceId, parseHours(hours));
  }

  @Patch(':deviceId')
  @Roles('admin')
  update(@Param('deviceId') deviceId: string, @Body() body: unknown) {
    return this.devices.update(deviceId, parsePatch(body));
  }
}

@Controller()
export class FleetController {
  constructor(private readonly devices: DevicesService) {}

  @Get('fleet/summary')
  summary(@CurrentUser() user: AuthUser, @Query('hours') hours?: string) {
    return this.devices.summary(user, parseHours(hours));
  }

  @Get('customers')
  customers(@CurrentUser() user: AuthUser) {
    return this.devices.listCustomers(user);
  }

  @Get('disconnections')
  disconnections(
    @CurrentUser() user: AuthUser,
    @Query('hours') hours?: string,
    @Query('deviceId') deviceId?: string,
  ) {
    return this.devices.disconnections(user, parseHours(hours), deviceId);
  }

  @Get('reports/availability')
  availabilityReport(@CurrentUser() user: AuthUser, @Query('hours') hours?: string) {
    return this.devices.availabilityReport(user, parseHours(hours));
  }
}
