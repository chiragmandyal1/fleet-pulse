import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { AuthUser } from '../auth/auth.types.js';
import { TimescaleService } from '../timescale/timescale.service.js';
import { Customer } from './customer.schema.js';
import { Device } from './device.schema.js';

export const LINK_STATUSES = ['online', 'offline', 'unknown'] as const;
export type LinkStatus = (typeof LINK_STATUSES)[number];

export interface DevicePatch {
  name?: string;
  rfThreshold?: number;
}

/**
 * A device silent for this long is `unknown`, not online: its last sample says
 * nothing about now. The simulator reports every 5s.
 */
const STALE_MS = 2 * 60_000;

/** Never expose Mongo internals. */
const PROJECTION = { _id: 0, __v: 0, createdAt: 0, updatedAt: 0 } as const;

interface Latest {
  status: LinkStatus;
  lastSeen: string | null;
  bandwidth: number | null;
  rfSignal: number | null;
}

const NEVER_SEEN: Latest = { status: 'unknown', lastSeen: null, bandwidth: null, rfSignal: null };

/**
 * The one place customer scoping is decided. Every query, Mongo or Timescale,
 * starts from the device set this returns, so a customer can never reach
 * another customer's data by guessing an id or a query param.
 */
export function customerScope(user: AuthUser): { customerId?: string } {
  if (user.role !== 'customer') return {};
  // Fail closed: a customer account with no customer sees nothing, not everything.
  if (!user.customerId) throw new ForbiddenException('account has no customer');
  return { customerId: user.customerId };
}

@Injectable()
export class DevicesService {
  constructor(
    @InjectModel(Device.name) private readonly devices: Model<Device>,
    @InjectModel(Customer.name) private readonly customers: Model<Customer>,
    private readonly timescale: TimescaleService,
  ) {}

  // ponytail: no pagination, the fleet is a few hundred devices. Add limit/cursor past ~5k.
  async list(user: AuthUser, filter: { customerId?: string; status?: LinkStatus }) {
    // Scope is spread last, so it overrides a customer asking for someone else's id.
    const query = { ...(filter.customerId && { customerId: filter.customerId }), ...customerScope(user) };
    const devices = await this.devices.find(query, PROJECTION).sort({ deviceId: 1 }).lean();
    const latest = await this.latest(devices.map((d) => d.deviceId));
    const rows = devices.map((d) => ({ ...d, ...(latest.get(d.deviceId) ?? NEVER_SEEN) }));
    return filter.status ? rows.filter((r) => r.status === filter.status) : rows;
  }

  async findOne(user: AuthUser, deviceId: string) {
    const device = await this.devices.findOne({ deviceId, ...customerScope(user) }, PROJECTION).lean();
    // 404 rather than 403 for another customer's device: don't confirm it exists.
    if (!device) throw new NotFoundException(`device ${deviceId} not found`);
    const latest = await this.latest([deviceId]);
    return { ...device, ...(latest.get(deviceId) ?? NEVER_SEEN) };
  }

  async update(deviceId: string, patch: DevicePatch) {
    const device = await this.devices
      .findOneAndUpdate({ deviceId }, { $set: patch }, { returnDocument: 'after', projection: PROJECTION })
      .lean();
    if (!device) throw new NotFoundException(`device ${deviceId} not found`);
    return device;
  }

  /** Per-device history for the drilldown chart, from the 5-minute aggregate. */
  async telemetry(user: AuthUser, deviceId: string, hours: number) {
    if (!(await this.devices.exists({ deviceId, ...customerScope(user) }))) {
      throw new NotFoundException(`device ${deviceId} not found`);
    }
    return this.timescale.query(
      `SELECT bucket,
              availability::float8  AS availability,
              avg_bandwidth         AS "avgBandwidth",
              avg_rf_signal         AS "avgRfSignal",
              samples::int          AS samples
         FROM telemetry_5min
        WHERE device_id = $1 AND bucket > now() - make_interval(hours => $2)
        ORDER BY bucket`,
      [deviceId, hours],
    );
  }

  /** Dashboard header: status counts now, plus the fleet-wide trend for the window. */
  async summary(user: AuthUser, hours: number) {
    const ids = (await this.devices.find(customerScope(user), { deviceId: 1 }).lean()).map(
      (d) => d.deviceId,
    );
    const latest = await this.latest(ids);
    const counts = { total: ids.length, online: 0, offline: 0, unknown: 0 };
    for (const id of ids) counts[latest.get(id)?.status ?? 'unknown']++;

    const trend = await this.timescale.query<{
      bucket: Date;
      availability: number;
      onlineDevices: number;
      avgBandwidth: number | null;
      samples: number;
    }>(
      `SELECT bucket,
              (sum(availability * samples) / sum(samples))::float8 AS availability,
              -- Each device's availability summed = devices online, on average, in the bucket.
              sum(availability)::float8                            AS "onlineDevices",
              avg(avg_bandwidth)                                   AS "avgBandwidth",
              sum(samples)::int                                    AS samples
         FROM telemetry_5min
        WHERE device_id = ANY($1) AND bucket > now() - make_interval(hours => $2)
        GROUP BY bucket
        ORDER BY bucket`,
      [ids, hours],
    );

    // Weighted by samples, so a bucket with half the fleet reporting counts for half.
    const samples = trend.reduce((n, b) => n + b.samples, 0);
    const availability = samples
      ? trend.reduce((n, b) => n + b.availability * b.samples, 0) / samples
      : null;

    return { hours, counts, availability, trend };
  }

  /**
   * Outages in the window: each offline event from `link_events` paired with
   * the device's next event (it coming back). `end` is null while still down.
   * Events are written at ingest, so this reads thousands of rows, not the
   * millions of raw samples behind them.
   */
  async disconnections(user: AuthUser, hours: number, deviceId?: string) {
    // Both conditions apply: a device filter never widens what the caller's scope allows.
    const filter = { ...(deviceId && { deviceId }), ...customerScope(user) };
    const devices = await this.devices.find(filter, { _id: 0, deviceId: 1, name: 1, customerId: 1 }).lean();
    const byId = new Map(devices.map((d) => [d.deviceId, d]));
    const rows = await this.timescale.query<{ deviceId: string; start: Date; end: Date | null; durationSec: number }>(
      `SELECT device_id AS "deviceId", time AS start, next_change AS "end",
              extract(epoch FROM coalesce(next_change, now()) - time)::int AS "durationSec"
         FROM (SELECT device_id, time, online,
                      lead(time) OVER (PARTITION BY device_id ORDER BY time) AS next_change
                 FROM link_events
                WHERE device_id = ANY($1) AND time > now() - make_interval(hours => $2)) e
        WHERE NOT online
        ORDER BY start DESC`,
      [[...byId.keys()], hours],
    );
    return rows.map((r) => ({ ...r, name: byId.get(r.deviceId)?.name, customerId: byId.get(r.deviceId)?.customerId }));
  }

  /** Per-device availability for the window, for the downloadable report. */
  async availabilityReport(user: AuthUser, hours: number) {
    const devices = await this.devices.find(customerScope(user), PROJECTION).sort({ deviceId: 1 }).lean();
    const rows = await this.timescale.query<{
      deviceId: string;
      availability: number;
      downtimeMin: number;
      avgBandwidth: number | null;
      avgRfSignal: number | null;
    }>(
      `SELECT device_id                                            AS "deviceId",
              (sum(availability * samples) / sum(samples))::float8 AS availability,
              -- Each bucket is 5 minutes; the offline share of it is downtime.
              sum((1 - availability) * 5)::float8                   AS "downtimeMin",
              avg(avg_bandwidth)                                    AS "avgBandwidth",
              avg(avg_rf_signal)                                    AS "avgRfSignal"
         FROM telemetry_5min
        WHERE device_id = ANY($1) AND bucket > now() - make_interval(hours => $2)
        GROUP BY device_id`,
      [devices.map((d) => d.deviceId), hours],
    );
    const stats = new Map(rows.map((r) => [r.deviceId, r]));
    return devices.map((d) => ({
      ...d,
      availability: null,
      downtimeMin: null,
      avgBandwidth: null,
      avgRfSignal: null,
      ...stats.get(d.deviceId),
    }));
  }

  listCustomers(user: AuthUser) {
    return this.customers.find(customerScope(user), PROJECTION).sort({ name: 1 }).lean();
  }

  /** Most recent sample per device, read from raw telemetry so it is current to the tick. */
  private async latest(deviceIds: string[]): Promise<Map<string, Latest>> {
    if (deviceIds.length === 0) return new Map();
    // DISTINCT ON walks the (device_id, time DESC) index; the time bound keeps
    // it to the newest chunk instead of every chunk ever written.
    const rows = await this.timescale.query<{
      device_id: string;
      time: Date;
      online: boolean;
      bandwidth: number | null;
      rf_signal: number | null;
    }>(
      `SELECT DISTINCT ON (device_id) device_id, time, online, bandwidth, rf_signal
         FROM telemetry
        WHERE device_id = ANY($1) AND time > now() - interval '1 hour'
        ORDER BY device_id, time DESC`,
      [deviceIds],
    );

    const now = Date.now();
    return new Map(
      rows.map((r) => [
        r.device_id,
        {
          status: now - r.time.getTime() > STALE_MS ? 'unknown' : r.online ? 'online' : 'offline',
          lastSeen: r.time.toISOString(),
          bandwidth: r.bandwidth,
          rfSignal: r.rf_signal,
        },
      ]),
    );
  }
}
