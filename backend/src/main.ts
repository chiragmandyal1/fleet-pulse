import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Telemetry batches are large; the 100kb express default rejects them.
  app.useBodyParser('json', { limit: '10mb' });
  app.enableCors();
  const port = app.get(ConfigService).get<number>('port') ?? 3000;
  await app.listen(port);
}
void bootstrap();
