import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { IngestionService } from './ingestion.service.js';
import { InvalidSampleError, parseBatch } from './telemetry.dto.js';

@Controller('telemetry')
export class IngestionController {
  constructor(private readonly ingestion: IngestionService) {}

  @Post('batch')
  async batch(@Body() body: unknown) {
    let samples;
    try {
      samples = parseBatch(body);
    } catch (err) {
      // A malformed batch is the client's bug, not a 500.
      if (err instanceof InvalidSampleError) throw new BadRequestException(err.message);
      throw err;
    }
    return { written: await this.ingestion.ingest(samples) };
  }
}
