/**
 * Fake fleet generation. Every name, site, and coordinate here is invented —
 * this project exists specifically so there is something public to show that
 * contains no real customer data.
 */

export type DeviceKind = 'fixed' | 'mobile' | 'hybrid';

export interface Device {
  deviceId: string;
  name: string;
  kind: DeviceKind;
  customerId: string;
  site: string;
  lat: number;
  lon: number;
  rfThreshold: number;
}

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

/** Roughly the bounding box of mainland India, so the map looks plausible. */
const LAT = { min: 8.4, max: 34.0 };
const LON = { min: 68.7, max: 92.5 };

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

const pick = <T>(rand: () => number, xs: T[]): T => xs[Math.floor(rand() * xs.length)];
const between = (rand: () => number, min: number, max: number) => min + rand() * (max - min);

export function buildFleet(count: number, seed = 42): Device[] {
  const rand = rng(seed);
  return Array.from({ length: count }, (_, i) => {
    const kind: DeviceKind = rand() < 0.65 ? 'fixed' : rand() < 0.6 ? 'mobile' : 'hybrid';
    const customer = pick(rand, CUSTOMERS);
    const site = `${pick(rand, SITE_PREFIX)} ${pick(rand, SITE_SUFFIX)}`;
    const id = `FP-${String(i + 1).padStart(5, '0')}`;
    return {
      deviceId: id,
      name: `${site} ${kind === 'mobile' ? 'Mobile' : 'Link'} ${i + 1}`,
      kind,
      customerId: customer.customerId,
      site,
      lat: Number(between(rand, LAT.min, LAT.max).toFixed(5)),
      lon: Number(between(rand, LON.min, LON.max).toFixed(5)),
      // Mobile terminals are held to a looser threshold; they are expected to
      // degrade while moving.
      rfThreshold: kind === 'mobile' ? 6 : 8,
    };
  });
}
