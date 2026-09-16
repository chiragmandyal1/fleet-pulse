import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { PG_POOL, TimescaleService } from './timescale.service.js';

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Pool({
          ...config.getOrThrow('timescale'),
          // The simulator opens a burst of concurrent batch writes; without a
          // ceiling here those queue on the server instead of in the pool.
          max: 10,
        }),
    },
    TimescaleService,
  ],
  exports: [TimescaleService],
})
export class TimescaleModule {}
