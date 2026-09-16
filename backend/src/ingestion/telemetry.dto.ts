/**
 * One telemetry sample. The simulator posts these in batches.
 *
 * Validated by hand rather than with class-validator: this is the one endpoint
 * taking untrusted input at volume, and the rules are small enough that a
 * decorator stack would be more machinery than the checks themselves.
 */
export interface TelemetrySample {
  deviceId: string;
  /** ISO-8601. */
  time: string;
  online: boolean;
  /** Mbps. Null/absent when offline — absence is not zero throughput. */
  bandwidth?: number | null;
  /** dB. Same. */
  rfSignal?: number | null;
}

export interface TelemetryBatch {
  samples: TelemetrySample[];
}

export class InvalidSampleError extends Error {}

/** Largest batch accepted in one request; keeps a bad client from OOMing us. */
export const MAX_BATCH = 5000;

const isFiniteOrNull = (v: unknown): v is number | null | undefined =>
  v === null || v === undefined || (typeof v === 'number' && Number.isFinite(v));

export function parseBatch(body: unknown): TelemetrySample[] {
  const samples = (body as TelemetryBatch | undefined)?.samples;
  if (!Array.isArray(samples)) {
    throw new InvalidSampleError('body.samples must be an array');
  }
  if (samples.length === 0) {
    throw new InvalidSampleError('body.samples is empty');
  }
  if (samples.length > MAX_BATCH) {
    throw new InvalidSampleError(`batch too large: ${samples.length} > ${MAX_BATCH}`);
  }

  return samples.map((raw, i) => {
    const s = raw as Partial<TelemetrySample>;
    if (typeof s?.deviceId !== 'string' || s.deviceId.length === 0) {
      throw new InvalidSampleError(`samples[${i}].deviceId must be a non-empty string`);
    }
    if (typeof s.online !== 'boolean') {
      throw new InvalidSampleError(`samples[${i}].online must be a boolean`);
    }
    // Number.isNaN(new Date('nonsense')) is how an unparseable date shows up.
    const time = new Date(s.time as string);
    if (Number.isNaN(time.getTime())) {
      throw new InvalidSampleError(`samples[${i}].time is not a valid date`);
    }
    if (!isFiniteOrNull(s.bandwidth)) {
      throw new InvalidSampleError(`samples[${i}].bandwidth must be a finite number or null`);
    }
    if (!isFiniteOrNull(s.rfSignal)) {
      throw new InvalidSampleError(`samples[${i}].rfSignal must be a finite number or null`);
    }
    return {
      deviceId: s.deviceId,
      time: time.toISOString(),
      online: s.online,
      bandwidth: s.bandwidth ?? null,
      rfSignal: s.rfSignal ?? null,
    };
  });
}
