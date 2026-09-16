/**
 * Fleet Pulse simulator.
 *
 *   npm start                     # live: one tick every TICK_MS, forever
 *   npm start -- --backfill 6h    # write 6h of history fast, then go live
 *
 * Seeds device metadata into Mongo via the backend, then posts telemetry
 * batches to it. Nothing here touches a real network.
 */
import { MongoClient } from 'mongodb';
import { buildFleet, CUSTOMERS, Device, rng } from './fleet.js';
import { initialState, tick } from './telemetry.js';

const API = process.env.API_URL ?? 'http://localhost:3000';
const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://localhost:27018/fleetpulse';
const DEVICE_COUNT = Number(process.env.DEVICE_COUNT ?? 300);
const TICK_MS = Number(process.env.TICK_MS ?? 5000);

/** Parses `6h`, `30m`, `90s` into milliseconds. */
function parseDuration(text: string): number {
  const m = /^(\d+)([smhd])$/.exec(text.trim());
  if (!m) throw new Error(`bad duration: ${text} (expected e.g. 6h, 30m, 90s)`);
  const unit = { s: 1e3, m: 60e3, h: 3600e3, d: 86400e3 }[m[2]]!;
  return Number(m[1]) * unit;
}

async function seedMongo(devices: Device[]): Promise<void> {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db();
    await db.collection('customers').createIndex({ customerId: 1 }, { unique: true });
    await db.collection('devices').createIndex({ deviceId: 1 }, { unique: true });

    // Upsert so a rerun refreshes metadata instead of duplicating the fleet.
    await db.collection('customers').bulkWrite(
      CUSTOMERS.map((c) => ({
        updateOne: { filter: { customerId: c.customerId }, update: { $set: c }, upsert: true },
      })),
    );
    await db.collection('devices').bulkWrite(
      devices.map((d) => ({
        updateOne: { filter: { deviceId: d.deviceId }, update: { $set: d }, upsert: true },
      })),
    );
    console.log(`seeded ${CUSTOMERS.length} customers, ${devices.length} devices`);
  } finally {
    await client.close();
  }
}

async function post(samples: unknown[]): Promise<number> {
  const res = await fetch(`${API}/telemetry/batch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ samples }),
  });
  if (!res.ok) {
    throw new Error(`ingest failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return ((await res.json()) as { written: number }).written;
}

async function main(): Promise<void> {
  const backfillArg = process.argv.indexOf('--backfill');
  const backfillMs = backfillArg > -1 ? parseDuration(process.argv[backfillArg + 1] ?? '') : 0;

  const devices = buildFleet(DEVICE_COUNT);
  await seedMongo(devices);

  const state = initialState(devices);
  const rand = rng(1337);

  if (backfillMs > 0) {
    const ticks = Math.floor(backfillMs / TICK_MS);
    console.log(`backfilling ${ticks} ticks (${backfillMs / 3600e3}h)...`);
    let written = 0;
    // Batch several ticks per request; one request per tick would be thousands
    // of round trips for a few hours of history.
    let buffer: unknown[] = [];
    for (let i = ticks; i > 0; i--) {
      const at = new Date(Date.now() - i * TICK_MS);
      buffer.push(...tick(devices, state, at, rand));
      if (buffer.length >= 4000) {
        written += await post(buffer);
        buffer = [];
      }
    }
    if (buffer.length) written += await post(buffer);
    console.log(`backfill done: ${written} samples`);
  }

  console.log(`live: ${devices.length} devices every ${TICK_MS}ms -> ${API}`);
  for (;;) {
    const started = Date.now();
    try {
      const written = await post(tick(devices, state, new Date(), rand));
      const offline = [...state.values()].filter((s) => !s.online).length;
      console.log(`${new Date().toISOString()}  wrote ${written}  offline ${offline}`);
    } catch (err) {
      // The backend restarting mid-run should not kill the simulator.
      console.error(`tick failed: ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, Math.max(0, TICK_MS - (Date.now() - started))));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
