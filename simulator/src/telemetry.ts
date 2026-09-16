import { Device, rng } from './fleet.js';

export interface Sample {
  deviceId: string;
  time: string;
  online: boolean;
  bandwidth: number | null;
  rfSignal: number | null;
}

/**
 * Per-device state that has to persist between ticks. Telemetry without memory
 * looks wrong immediately: bandwidth teleports, and a device flaps on and off
 * every sample instead of staying down for a believable stretch.
 */
export interface DeviceState {
  online: boolean;
  /** Ticks remaining in the current outage. */
  outageLeft: number;
  /** Mbps, drifts rather than jumps. */
  bandwidth: number;
  /** dB, same. */
  rfSignal: number;
}

/** Chance per tick that a healthy device drops. ~1 outage per 500 ticks. */
const OUTAGE_CHANCE = 0.002;
/** Outages last between these many ticks. */
const OUTAGE_TICKS = { min: 3, max: 40 };

const BANDWIDTH = { min: 0.5, max: 120 };
const RF = { min: 2, max: 16 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function initialState(devices: Device[], seed = 7): Map<string, DeviceState> {
  const rand = rng(seed);
  return new Map(
    devices.map((d) => [
      d.deviceId,
      {
        online: true,
        outageLeft: 0,
        bandwidth: BANDWIDTH.min + rand() * (BANDWIDTH.max - BANDWIDTH.min),
        rfSignal: d.rfThreshold + rand() * 4,
      },
    ]),
  );
}

/**
 * Advance every device one tick and emit a sample each.
 *
 * `rand` is passed in rather than created here so the caller controls the
 * stream — a test can hand in a fixed sequence and assert exact behaviour.
 */
export function tick(
  devices: Device[],
  state: Map<string, DeviceState>,
  at: Date,
  rand: () => number,
): Sample[] {
  return devices.map((device) => {
    const s = state.get(device.deviceId);
    if (!s) throw new Error(`no state for ${device.deviceId}`);

    if (s.outageLeft > 0) {
      s.outageLeft -= 1;
      // Coming back up: signal recovers, throughput ramps from near zero.
      if (s.outageLeft === 0) {
        s.online = true;
        s.rfSignal = device.rfThreshold + rand() * 3;
        s.bandwidth = BANDWIDTH.min + rand() * 5;
      }
    } else if (rand() < outageChanceFor(device)) {
      s.online = false;
      s.outageLeft =
        OUTAGE_TICKS.min + Math.floor(rand() * (OUTAGE_TICKS.max - OUTAGE_TICKS.min));
    }

    if (s.online) {
      // Random walk, not a fresh random value: consecutive readings correlate.
      s.bandwidth = clamp(s.bandwidth + (rand() - 0.5) * 8, BANDWIDTH.min, BANDWIDTH.max);
      s.rfSignal = clamp(s.rfSignal + (rand() - 0.5) * 1.2, RF.min, RF.max);
    }

    return {
      deviceId: device.deviceId,
      time: at.toISOString(),
      online: s.online,
      // Offline means no reading at all, which is not the same as a reading of
      // zero — an average over nulls should skip them, not be dragged down.
      bandwidth: s.online ? Number(s.bandwidth.toFixed(2)) : null,
      rfSignal: s.online ? Number(s.rfSignal.toFixed(2)) : null,
    };
  });
}

/** Moving terminals drop more often than fixed dishes; hybrids fail over. */
function outageChanceFor(device: Device): number {
  if (device.kind === 'mobile') return OUTAGE_CHANCE * 3;
  if (device.kind === 'hybrid') return OUTAGE_CHANCE * 0.4;
  return OUTAGE_CHANCE;
}
