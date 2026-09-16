import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';

export const PG_POOL = 'PG_POOL';

/**
 * Thin wrapper over a pg Pool. Telemetry is written with COPY-shaped bulk
 * inserts and read with time_bucket aggregates — both are plain SQL, so an ORM
 * would only get in the way here. Device metadata lives in Mongo instead.
 */
@Injectable()
export class TimescaleService implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async query<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query<T>(sql, params);
    return result.rows;
  }

  onModuleDestroy() {
    return this.pool.end();
  }
}
