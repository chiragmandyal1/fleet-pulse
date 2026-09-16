import { Injectable, Logger } from '@nestjs/common';
import { TimescaleService } from '../timescale/timescale.service.js';
import { TelemetrySample } from './telemetry.dto.js';

/**
 * Postgres caps a statement at 65535 bound parameters. At 5 columns per sample
 * that is 13107 rows, so chunk below it with room to spare.
 */
export const INSERT_CHUNK = 2000;

@Injectable()
export class IngestionService {
  private readonly log = new Logger(IngestionService.name);

  constructor(private readonly timescale: TimescaleService) {}

  /**
   * Bulk-insert samples. Returns the number of rows written.
   *
   * One multi-row INSERT per chunk rather than a statement per sample: at a few
   * hundred devices reporting every few seconds, per-row round trips dominate
   * everything else.
   */
  async ingest(samples: TelemetrySample[]): Promise<number> {
    let written = 0;
    for (let i = 0; i < samples.length; i += INSERT_CHUNK) {
      written += await this.insertChunk(samples.slice(i, i + INSERT_CHUNK));
    }
    this.log.debug(`ingested ${written} samples`);
    return written;
  }

  private async insertChunk(chunk: TelemetrySample[]): Promise<number> {
    const params: unknown[] = [];
    const rows = chunk.map((s, i) => {
      const b = i * 5;
      params.push(s.time, s.deviceId, s.online, s.bandwidth, s.rfSignal);
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5})`;
    });

    await this.timescale.query(
      `INSERT INTO telemetry (time, device_id, online, bandwidth, rf_signal)
       VALUES ${rows.join(', ')}`,
      params,
    );
    return chunk.length;
  }
}
