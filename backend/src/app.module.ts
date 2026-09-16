import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import configuration from './config/configuration.js';
import { IngestionModule } from './ingestion/ingestion.module.js';
import { TimescaleModule } from './timescale/timescale.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ uri: config.getOrThrow<string>('mongoUri') }),
    }),
    TimescaleModule,
    IngestionModule,
  ],
})
export class AppModule {}
