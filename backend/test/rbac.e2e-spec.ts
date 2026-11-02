/**
 * Auth and customer scoping against the real databases (`docker compose up -d`).
 * Uses its own Mongo database and TEST- device ids, and cleans both up.
 */
import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { Connection } from 'mongoose';
import request from 'supertest';
import { TimescaleService } from '../src/timescale/timescale.service.js';

process.env.MONGO_URI = 'mongodb://localhost:27018/fleetpulse_test';
process.env.INGEST_KEY = 'test-ingest-key';
process.env.DEMO_PASSWORD = 'test-password';

const DEVICES = [
  { deviceId: 'TEST-1', customerId: 'cust-northwind' },
  { deviceId: 'TEST-2', customerId: 'cust-harrier' },
].map((d) => ({ ...d, name: d.deviceId, kind: 'fixed', site: 'Test Site', lat: 20, lon: 78, rfThreshold: 8 }));

let app: INestApplication;
const http = () => request(app.getHttpServer());

async function tokenFor(email: string): Promise<string> {
  const res = await http().post('/auth/login').send({ email, password: 'test-password' }).expect(200);
  return res.body.accessToken;
}

beforeAll(async () => {
  // Imported after the env is set: configuration() reads it at module load.
  const { AppModule } = await import('../src/app.module.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  const db = app.get<Connection>(getConnectionToken());
  await db.dropDatabase();
  await app.init(); // seeds the demo users into the empty database
  await db.collection('devices').insertMany(DEVICES.map((d) => ({ ...d })));
});

afterAll(async () => {
  if (!app) return;
  // Bounded by time so the delete never touches (and decompresses) old chunks.
  const timescale = app.get(TimescaleService);
  for (const table of ['telemetry', 'link_events']) {
    await timescale.query(`DELETE FROM ${table} WHERE device_id LIKE 'TEST-%' AND time > now() - interval '1 hour'`);
  }
  await app.get<Connection>(getConnectionToken()).dropDatabase();
  await app.close();
});

describe('authentication', () => {
  it('rejects a request with no token', () => http().get('/devices').expect(401));

  it('rejects a forged token', () =>
    http().get('/devices').set('Authorization', 'Bearer not.a.jwt').expect(401));

  it('gives the same error for a wrong password and an unknown email', async () => {
    const wrong = await http().post('/auth/login').send({ email: 'admin@fleetpulse.dev', password: 'nope' }).expect(401);
    const unknown = await http().post('/auth/login').send({ email: 'ghost@fleetpulse.dev', password: 'nope' }).expect(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });
});

describe('customer scoping', () => {
  let customer: string;
  beforeAll(async () => (customer = await tokenFor('northwind@fleetpulse.dev')));

  it('lists only its own devices, even when asking for another customer', async () => {
    for (const q of ['', '?customerId=cust-harrier']) {
      const res = await http().get(`/devices${q}`).set('Authorization', `Bearer ${customer}`).expect(200);
      expect(res.body.map((d: { deviceId: string }) => d.deviceId)).toEqual(['TEST-1']);
    }
  });

  it("gets 404, not 403, for another customer's device", async () => {
    await http().get('/devices/TEST-2').set('Authorization', `Bearer ${customer}`).expect(404);
    await http().get('/devices/TEST-2/telemetry').set('Authorization', `Bearer ${customer}`).expect(404);
  });

  it('counts only its own devices in the summary', async () => {
    const res = await http().get('/fleet/summary').set('Authorization', `Bearer ${customer}`).expect(200);
    expect(res.body.counts.total).toBe(1);
  });
});

describe('roles', () => {
  it('lets a viewer read every customer but not edit', async () => {
    const viewer = await tokenFor('viewer@fleetpulse.dev');
    const res = await http().get('/devices').set('Authorization', `Bearer ${viewer}`).expect(200);
    expect(res.body).toHaveLength(2);
    await http().patch('/devices/TEST-1').set('Authorization', `Bearer ${viewer}`).send({ rfThreshold: 5 }).expect(403);
  });

  it('lets an admin edit, but only the editable fields', async () => {
    const admin = await tokenFor('admin@fleetpulse.dev');
    const res = await http().patch('/devices/TEST-1').set('Authorization', `Bearer ${admin}`).send({ rfThreshold: 5 }).expect(200);
    expect(res.body.rfThreshold).toBe(5);
    await http().patch('/devices/TEST-1').set('Authorization', `Bearer ${admin}`).send({ customerId: 'cust-harrier' }).expect(400);
  });
});

describe('ingestion', () => {
  const batch = { samples: [{ deviceId: 'TEST-1', time: new Date().toISOString(), online: true, bandwidth: 40, rfSignal: 10 }] };

  it('rejects a missing or wrong ingest key', async () => {
    await http().post('/telemetry/batch').send(batch).expect(401);
    await http().post('/telemetry/batch').set('x-ingest-key', 'wrong').send(batch).expect(401);
  });

  it('accepts the key and the sample shows up as the device status', async () => {
    await http().post('/telemetry/batch').set('x-ingest-key', 'test-ingest-key').send(batch).expect(201, { written: 1 });
    const admin = await tokenFor('admin@fleetpulse.dev');
    const res = await http().get('/devices/TEST-1').set('Authorization', `Bearer ${admin}`).expect(200);
    expect(res.body).toMatchObject({ status: 'online', bandwidth: 40 });
  });
});

describe('disconnections and reports', () => {
  const ago = (s: number) => new Date(Date.now() - s * 1000).toISOString();

  beforeAll(async () => {
    // TEST-2 drops for 10 seconds; TEST-1 (Northwind's) stays up.
    await http()
      .post('/telemetry/batch')
      .set('x-ingest-key', 'test-ingest-key')
      .send({
        samples: [
          { deviceId: 'TEST-2', time: ago(30), online: true, bandwidth: 40, rfSignal: 10 },
          { deviceId: 'TEST-2', time: ago(20), online: false },
          { deviceId: 'TEST-2', time: ago(10), online: true, bandwidth: 40, rfSignal: 10 },
          { deviceId: 'TEST-1', time: ago(10), online: true, bandwidth: 40, rfSignal: 10 },
        ],
      })
      .expect(201);
  });

  it('turns an outage in ingested telemetry into one disconnection with its duration', async () => {
    const admin = await tokenFor('admin@fleetpulse.dev');
    const res = await http().get('/disconnections?hours=1').set('Authorization', `Bearer ${admin}`).expect(200);
    const drops = res.body.filter((e: { deviceId: string }) => e.deviceId === 'TEST-2');
    expect(drops).toHaveLength(1);
    expect(drops[0]).toMatchObject({ durationSec: 10, customerId: 'cust-harrier' });
    expect(drops[0].end).not.toBeNull();
  });

  it("keeps another customer's disconnections and report rows out", async () => {
    const customer = await tokenFor('northwind@fleetpulse.dev');
    const drops = await http().get('/disconnections?hours=1').set('Authorization', `Bearer ${customer}`).expect(200);
    expect(drops.body.some((e: { deviceId: string }) => e.deviceId === 'TEST-2')).toBe(false);
    const filtered = await http().get('/disconnections?hours=1&deviceId=TEST-2').set('Authorization', `Bearer ${customer}`).expect(200);
    expect(filtered.body).toEqual([]);
    const report = await http().get('/reports/availability?hours=24').set('Authorization', `Bearer ${customer}`).expect(200);
    expect(report.body.map((r: { deviceId: string }) => r.deviceId)).toEqual(['TEST-1']);
  });
});
