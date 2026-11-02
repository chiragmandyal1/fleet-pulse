import { Injectable, Logger } from '@nestjs/common';
import { TimescaleService } from '../timescale/timescale.service.js';
import { TelemetrySample } from './telemetry.dto.js';

/**
 * Postgres caps a statement at 65535 bound parameters. At 5 columns per sample
 * that is 13107 rows, so chunk below it with room to spare.
 */
export const INSERT_CHUNK = 2000;

export interface LinkEvent {
  time: string;
  deviceId: string;
  online: boolean;
}

/**
 * Online/offline transitions in a time-ordered batch. `previous` is each
 * device's last known state; a device with none counts as a transition only if
 * it starts offline (an outage already in progress when we first see it).
 */
export function detectTransitions(
  samples: TelemetrySample[],
  previous: ReadonlyMap<string, boolean>,
): { events: LinkEvent[]; latest: Map<string, boolean> } {
  const latest = new Map<string, boolean>();
  const events: LinkEvent[] = [];
  for (const s of samples) {
    const prev = latest.has(s.deviceId) ? latest.get(s.deviceId) : previous.get(s.deviceId);
    if (prev === undefined ? !s.online : prev !== s.online) {
      events.push({ time: s.time, deviceId: s.deviceId, online: s.online });
    }
    latest.set(s.deviceId, s.online);
  }
  return { events, latest };
}

@Injectable()
export class IngestionService {
  private readonly log = new Logger(IngestionService.name);
  /**
   * Last known online flag per device, so transitions can be detected as
   * batches arrive.
   * ponytail: in-process state, correct for one API instance. Running several
   * would need it in Redis or derived in SQL at insert time.
   */
  private readonly lastOnline = new Map<string, boolean>();

  constructor(private readonly timescale: TimescaleService) {}

  /**
   * Bulk-insert samples and the link events they imply. Returns the number of
   * samples written.
   *
   * One multi-row INSERT per chunk rather than a statement per sample: at a few
   * hundred devices reporting every few seconds, per-row round trips dominate
   * everything else.
   */
  async ingest(samples: TelemetrySample[]): Promise<number> {
    // parseBatch normalises every time to UTC ISO, so string order is time order.
    const ordered = [...samples].sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    await this.primeState(ordered.map((s) => s.deviceId));
    const { events, latest } = detectTransitions(ordered, this.lastOnline);

    let written = 0;
    for (let i = 0; i < ordered.length; i += INSERT_CHUNK) {
      written += await this.insert('telemetry (time, device_id, online, bandwidth, rf_signal)',
        ordered.slice(i, i + INSERT_CHUNK).map((s) => [s.time, s.deviceId, s.online, s.bandwidth, s.rfSignal]));
    }
    for (let i = 0; i < events.length; i += INSERT_CHUNK) {
      await this.insert('link_events (time, device_id, online)',
        events.slice(i, i + INSERT_CHUNK).map((e) => [e.time, e.deviceId, e.online]));
    }
    // Only after both inserts succeed: a failed batch must not advance the state.
    for (const [id, online] of latest) this.lastOnline.set(id, online);

    this.log.debug(`ingested ${written} samples, ${events.length} link events`);
    return written;
  }

  /** After a restart, seed state from each device's newest stored sample. */
  private async primeState(deviceIds: string[]): Promise<void> {
    const unknown = [...new Set(deviceIds)].filter((id) => !this.lastOnline.has(id));
    if (unknown.length === 0) return;
    const rows = await this.timescale.query<{ device_id: string; online: boolean }>(
      `SELECT DISTINCT ON (device_id) device_id, online
         FROM telemetry
        WHERE device_id = ANY($1) AND time > now() - interval '1 day'
        ORDER BY device_id, time DESC`,
      [unknown],
    );
    for (const r of rows) this.lastOnline.set(r.device_id, r.online);
  }

  private async insert(target: string, rows: unknown[][]): Promise<number> {
    const params: unknown[] = [];
    const values = rows.map((row) => {
      const placeholders = row.map((v) => {
        params.push(v);
        return `$${params.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    await this.timescale.query(`INSERT INTO ${target} VALUES ${values.join(', ')}`, params);
    return rows.length;
  }
}
