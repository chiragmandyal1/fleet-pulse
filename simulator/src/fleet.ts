/**
 * Fake fleet generation. Every name, site, and coordinate here is invented —
 * this project exists specifically so there is something public to show that
 * contains no real customer data.
 */

export type DeviceKind = 'fixed' | 'mobile' | 'hybrid';

/** Cellular backup. Hybrid terminals fail over to it; mobile ones carry one too. */
export interface Sim {
  iccid: string;
  carrier: string;
  planGb: number;
}

export interface Device {
  deviceId: string;
  name: string;
  kind: DeviceKind;
  customerId: string;
  site: string;
  lat: number;
  lon: number;
  rfThreshold: number;
  satellite: string;
  beam: Beam;
  sim?: Sim;
}

export type Beam = 'North' | 'East' | 'West' | 'South';

export interface Customer {
  customerId: string;
  name: string;
  sector: string;
}

/** Invented companies. Any resemblance to a real one is accidental. */
export const CUSTOMERS: Customer[] = [
  { customerId: 'cust-northwind', name: 'Northwind Bank', sector: 'banking' },
  { customerId: 'cust-tesseract', name: 'Tesseract Telecom', sector: 'telecom' },
  { customerId: 'cust-harrier', name: 'Harrier Defence Systems', sector: 'defense' },
  { customerId: 'cust-lumen', name: 'Lumen IT Services', sector: 'it' },
  { customerId: 'cust-corvus', name: 'Corvus Logistics', sector: 'logistics' },
];

/**
 * Real city centres, used only as anchors so the map looks like a plausible
 * Indian fleet. Coastal anchors are nudged inland so fixed sites don't jitter
 * into the sea.
 */
const ANCHORS: [lat: number, lon: number][] = [
  [28.61, 77.21], [19.2, 73.1], [12.97, 77.59], [17.39, 78.49], [13.0, 80.0],
  [22.57, 88.2], [18.52, 73.86], [23.02, 72.57], [26.91, 75.79], [26.85, 80.95],
  [23.26, 77.41], [21.15, 79.09], [25.59, 85.14], [26.14, 91.74], [30.73, 76.78],
  [34.08, 74.8], [21.25, 81.63], [20.3, 85.7], [10.0, 76.5], [30.32, 78.03],
];
/** Degrees of scatter around an anchor: ~35 km for a dish, ~250 km for a roaming terminal. */
const SCATTER = { fixed: 0.35, roaming: 2.5 };

const SITE_PREFIX = ['Ridge', 'Harbour', 'Vantage', 'Cedar', 'Kestrel', 'Basalt', 'Foxglove', 'Meridian'];
const SITE_SUFFIX = ['Depot', 'Hub', 'Relay', 'Station', 'Yard', 'Post', 'Terminal', 'Node'];

/**
 * Deterministic PRNG (mulberry32). Seeded so a given seed always produces the
 * same fleet — otherwise every restart reshuffles the map and nothing that
 * depends on a device id survives a rerun.
 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Invented, like everything else here. Two birds, two beams each. */
export const SATELLITES: Record<Beam, string> = {
  North: 'Aster-2',
  East: 'Aster-2',
  West: 'Aster-1',
  South: 'Aster-1',
};

const CARRIERS = ['Kite Mobile', 'Northstar Cellular', 'Tidewave'];
const PLANS_GB = [10, 25, 50];

/** Beam footprint by region, roughly: the north band, then west / south / east of centre. */
function beamFor(lat: number, lon: number): Beam {
  if (lat >= 24) return 'North';
  if (lon < 78) return 'West';
  if (lat < 17) return 'South';
  return 'East';
}

const pick = <T>(rand: () => number, xs: T[]): T => xs[Math.floor(rand() * xs.length)];
const between = (rand: () => number, min: number, max: number) => min + rand() * (max - min);

export function buildFleet(count: number, seed = 42): Device[] {
  const rand = rng(seed);
  return Array.from({ length: count }, (_, i) => {
    const kind: DeviceKind = rand() < 0.65 ? 'fixed' : rand() < 0.6 ? 'mobile' : 'hybrid';
    const customer = pick(rand, CUSTOMERS);
    const site = `${pick(rand, SITE_PREFIX)} ${pick(rand, SITE_SUFFIX)}`;
    const id = `FP-${String(i + 1).padStart(5, '0')}`;
    // Mobile terminals roam (vehicles, vessels), so they may sit off the coast;
    // fixed dishes and hybrids stay close to a city.
    const [lat, lon] = pick(rand, ANCHORS);
    const r = kind === 'mobile' ? SCATTER.roaming : SCATTER.fixed;
    const devLat = Number(between(rand, lat - r, lat + r).toFixed(5));
    const devLon = Number(between(rand, lon - r, lon + r).toFixed(5));
    const beam = beamFor(devLat, devLon);
    // A separate stream per device, so adding fields never reshuffles the
    // attributes above (ids, customers and positions stay stable across versions).
    const extra = rng(seed * 7919 + i);
    return {
      deviceId: id,
      name: `${site} ${kind === 'mobile' ? 'Mobile' : 'Link'} ${i + 1}`,
      kind,
      customerId: customer.customerId,
      site,
      lat: devLat,
      lon: devLon,
      // Mobile terminals are held to a looser threshold; they are expected to
      // degrade while moving.
      rfThreshold: kind === 'mobile' ? 6 : 8,
      satellite: SATELLITES[beam],
      beam,
      ...(kind !== 'fixed' && {
        sim: {
          // 89 = telecom, 91 = India; the remaining digits are random.
          iccid: '8991' + Array.from({ length: 15 }, () => Math.floor(extra() * 10)).join(''),
          carrier: pick(extra, CARRIERS),
          planGb: pick(extra, PLANS_GB),
        },
      }),
    };
  });
}
