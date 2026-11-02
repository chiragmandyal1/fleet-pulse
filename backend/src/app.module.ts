import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module.js';
import configuration from './config/configuration.js';
import { DevicesModule } from './devices/devices.module.js';
import { HealthController } from './health.controller.js';
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
    AuthModule,
    DevicesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
