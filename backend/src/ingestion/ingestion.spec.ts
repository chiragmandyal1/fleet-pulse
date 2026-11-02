import { TimescaleService } from '../timescale/timescale.service.js';
import { detectTransitions, INSERT_CHUNK, IngestionService } from './ingestion.service.js';
import { InvalidSampleError, MAX_BATCH, parseBatch } from './telemetry.dto.js';

const sample = (over: Record<string, unknown> = {}) => ({
  deviceId: 'FP-00001',
  time: '2026-10-08T04:00:00Z',
  online: true,
  bandwidth: 42.5,
  rfSignal: 9.1,
  ...over,
});

describe('parseBatch', () => {
  it('normalises time to ISO and missing readings to null', () => {
    const [s] = parseBatch({
      samples: [sample({ time: '2026-10-08T09:30:00+05:30', online: false, bandwidth: undefined, rfSignal: undefined })],
    });
    expect(s).toEqual({
      deviceId: 'FP-00001',
      time: '2026-10-08T04:00:00.000Z',
      online: false,
      bandwidth: null,
      rfSignal: null,
    });
  });

  it.each([
    ['no samples array', {}],
    ['an empty batch', { samples: [] }],
    ['an oversized batch', { samples: Array.from({ length: MAX_BATCH + 1 }, () => sample()) }],
    ['an empty deviceId', { samples: [sample({ deviceId: '' })] }],
    ['a string online flag', { samples: [sample({ online: 'true' })] }],
    ['an unparseable time', { samples: [sample({ time: 'yesterday-ish' })] }],
    ['a NaN bandwidth', { samples: [sample({ bandwidth: NaN })] }],
    ['an Infinity rfSignal', { samples: [sample({ rfSignal: Infinity })] }],
    ['a string bandwidth', { samples: [sample({ bandwidth: '42' })] }],
  ])('rejects %s', (_, body) => {
    expect(() => parseBatch(body)).toThrow(InvalidSampleError);
  });

  it('names the offending sample index in the error', () => {
    expect(() => parseBatch({ samples: [sample(), sample({ online: 1 })] })).toThrow('samples[1].online');
  });
});

describe('IngestionService', () => {
  it('splits a large batch into multi-row inserts under the bind-parameter limit', async () => {
    const calls: unknown[][] = [];
    const timescale = {
      query: async (sql: string, params: unknown[]) => {
        if (sql.startsWith('INSERT INTO telemetry')) calls.push(params);
        return [];
      },
    };
    const service = new IngestionService(timescale as unknown as TimescaleService);

    const n = INSERT_CHUNK * 2 + 500;
    const written = await service.ingest(parseBatch({ samples: Array.from({ length: n }, () => sample()) }));

    expect(written).toBe(n);
    // 5 columns per row; Postgres rejects a statement with more than 65535 parameters.
    expect(calls.map((p) => p.length)).toEqual([INSERT_CHUNK * 5, INSERT_CHUNK * 5, 500 * 5]);
    expect(Math.max(...calls.map((p) => p.length))).toBeLessThanOrEqual(65535);
  });
});

describe('detectTransitions', () => {
  const at = (minute: number, online: boolean, deviceId = 'FP-00001') =>
    sample({ deviceId, online, time: `2026-10-08T04:${String(minute).padStart(2, '0')}:00.000Z` }) as never;

  it('records each change of state, not every sample', () => {
    const { events, latest } = detectTransitions(
      [at(0, true), at(1, true), at(2, false), at(3, false), at(4, true)],
      new Map([['FP-00001', true]]),
    );
    expect(events.map((e) => [e.time.slice(14, 16), e.online])).toEqual([['02', false], ['04', true]]);
    expect(latest.get('FP-00001')).toBe(true);
  });

  it('treats a device first seen offline as an outage already in progress', () => {
    const { events } = detectTransitions([at(0, false, 'A'), at(0, true, 'B')], new Map());
    expect(events.map((e) => [e.deviceId, e.online])).toEqual([['A', false]]);
  });

  it('continues from the state the previous batch left', () => {
    expect(detectTransitions([at(5, false)], new Map([['FP-00001', false]])).events).toEqual([]);
  });
});
