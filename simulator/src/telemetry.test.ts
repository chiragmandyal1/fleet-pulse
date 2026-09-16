import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFleet, rng } from './fleet.js';
import { initialState, tick } from './telemetry.js';

const fleet = (n = 5) => buildFleet(n, 1);

test('a fleet is deterministic for a given seed', () => {
  assert.deepEqual(buildFleet(20, 99), buildFleet(20, 99));
  assert.notDeepEqual(buildFleet(20, 99), buildFleet(20, 100));
});

test('emits one sample per device per tick', () => {
  const devices = fleet(12);
  const samples = tick(devices, initialState(devices), new Date(), rng(5));
  assert.equal(samples.length, 12);
  assert.deepEqual(
    samples.map((s) => s.deviceId).sort(),
    devices.map((d) => d.deviceId).sort(),
  );
});

test('offline samples carry null readings, never zero', () => {
  const devices = fleet(3);
  const state = initialState(devices);
  // Force everything down: rand() === 0 is below any outage chance.
  const samples = tick(devices, state, new Date(), () => 0);

  assert.ok(samples.every((s) => !s.online), 'all devices should be offline');
  for (const s of samples) {
    assert.equal(s.bandwidth, null, 'offline bandwidth must be null, not 0');
    assert.equal(s.rfSignal, null, 'offline rfSignal must be null, not 0');
  }
});

test('an outage lasts multiple ticks instead of flapping every sample', () => {
  const devices = fleet(1);
  const state = initialState(devices);
  // Knock it offline, then stop triggering new outages.
  tick(devices, state, new Date(), () => 0);
  assert.equal(state.get(devices[0].deviceId)!.online, false);

  // rand() === 0.999 is above the outage chance, so nothing new is triggered;
  // the device should still be held down by the outage already in progress.
  const next = tick(devices, state, new Date(), () => 0.999);
  assert.equal(next[0].online, false, 'device recovered after a single tick');
});

test('an outage ends and the device comes back online', () => {
  const devices = fleet(1);
  const state = initialState(devices);
  tick(devices, state, new Date(), () => 0);

  // Longest possible outage is OUTAGE_TICKS.max; run past it.
  let last = tick(devices, state, new Date(), () => 0.999);
  for (let i = 0; i < 60 && !last[0].online; i++) {
    last = tick(devices, state, new Date(), () => 0.999);
  }
  assert.equal(last[0].online, true, 'device never recovered');
  assert.ok(last[0].bandwidth !== null && last[0].bandwidth > 0);
});

test('online readings drift rather than jump', () => {
  const devices = fleet(1);
  const state = initialState(devices);
  const rand = rng(11);
  let previous = tick(devices, state, new Date(), rand)[0];

  for (let i = 0; i < 200; i++) {
    const current = tick(devices, state, new Date(), rand)[0];
    if (previous.online && current.online) {
      // One step of the random walk is bounded by +/- 4 Mbps and +/- 0.6 dB.
      assert.ok(
        Math.abs(current.bandwidth! - previous.bandwidth!) <= 4.01,
        `bandwidth jumped ${previous.bandwidth} -> ${current.bandwidth}`,
      );
      assert.ok(
        Math.abs(current.rfSignal! - previous.rfSignal!) <= 0.61,
        `rfSignal jumped ${previous.rfSignal} -> ${current.rfSignal}`,
      );
    }
    previous = current;
  }
});

test('readings stay inside their physical ranges', () => {
  const devices = fleet(40);
  const state = initialState(devices);
  const rand = rng(3);
  for (let i = 0; i < 100; i++) {
    for (const s of tick(devices, state, new Date(), rand)) {
      if (s.bandwidth !== null) assert.ok(s.bandwidth >= 0.5 && s.bandwidth <= 120, `bandwidth ${s.bandwidth}`);
      if (s.rfSignal !== null) assert.ok(s.rfSignal >= 2 && s.rfSignal <= 16, `rfSignal ${s.rfSignal}`);
    }
  }
});
