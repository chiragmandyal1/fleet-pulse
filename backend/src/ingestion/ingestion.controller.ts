import { createHash, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators.js';
import { IngestionService } from './ingestion.service.js';
import { InvalidSampleError, parseBatch } from './telemetry.dto.js';

@Controller('telemetry')
export class IngestionController {
  constructor(
    private readonly ingestion: IngestionService,
    private readonly config: ConfigService,
  ) {}

  /** Machine-to-machine: authenticated by a shared key instead of a user JWT. */
  @Public()
  @Post('batch')
  async batch(@Headers('x-ingest-key') key: string | undefined, @Body() body: unknown) {
    if (!this.keyMatches(key)) throw new UnauthorizedException('missing or wrong x-ingest-key');
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

  /** Hash both sides first: timingSafeEqual needs equal lengths, and this hides the key's length too. */
  private keyMatches(key: string | undefined): boolean {
    if (!key) return false;
    const digest = (v: string) => createHash('sha256').update(v).digest();
    return timingSafeEqual(digest(key), digest(this.config.getOrThrow<string>('ingestKey')));
  }
}
