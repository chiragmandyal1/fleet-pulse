import { useEffect, useState } from 'react'
import { UnauthorizedError } from './api.ts'

/** The simulator ticks every 5s; 10s keeps the wall screen live without hammering the API. */
const POLL_MS = 10_000

export const WINDOWS = [
  { hours: 6, label: '6h' },
  { hours: 24, label: '24h' },
  { hours: 168, label: '7d' },
  { hours: 720, label: '30d' },
]

export const STATUS_COLOR = { online: 'success', offline: 'error', unknown: 'default' } as const

/**
 * Loads now and every POLL_MS. Keeps the last good data on a failed poll, so a
 * backend restart shows an error banner instead of blanking the screen.
 */
export function usePolling<T>(load: () => Promise<T>, onUnauthorized: () => void) {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string>()
  // Bumped by reload() to refetch right away, e.g. after an edit.
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let alive = true
    const run = () =>
      load()
        .then((d) => {
          if (!alive) return
          setData(d)
          setError(undefined)
        })
        .catch((err) => {
          if (!alive) return
          if (err instanceof UnauthorizedError) onUnauthorized()
          else setError((err as Error).message)
        })
    run()
    const id = setInterval(run, POLL_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [load, onUnauthorized, nonce])

  return { data, error, reload: () => setNonce((n) => n + 1) }
}

export function ago(iso: string | null): string {
  if (!iso) return 'never'
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

/** 3725 -> "1h 2m", 45 -> "45s". */
export function duration(sec: number): string {
  if (sec < 60) return `${sec}s`
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h ? `${h}h ${m}m` : `${m}m ${sec % 60}s`
}

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

/** RFC 4180: quote every field, double any quote inside it. */
export function toCsv<T>(rows: T[], columns: [header: string, value: (row: T) => unknown][]): string {
  const cell = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`
  return [columns.map(([h]) => cell(h)), ...rows.map((r) => columns.map(([, get]) => cell(get(r))))]
    .map((line) => line.join(','))
    .join('\r\n')
}

export function downloadFile(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}

/** Expiry of the stored JWT. Display only: the server is what enforces it. */
export function tokenExpiry(token: string | undefined): Date | null {
  try {
    const payload = JSON.parse(atob(token!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.exp === 'number' ? new Date(payload.exp * 1000) : null
  } catch {
    return null
  }
}

/** "jo.smith@x" -> "JS"; a one-word name gets one letter ("northwind@x" -> "N", not "NO"). */
export function initials(email: string): string {
  const parts = email.split('@')[0].split(/[._-]/).filter(Boolean)
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
}

/**
 * Averages consecutive points so a long window draws as a readable line, not a
 * comb: 24h of 5-minute buckets is 288 points across a 500px chart. Nulls (a
 * fully offline bucket) are skipped; a group of only nulls stays null.
 */
export function downsample<T extends { bucket: string }>(rows: T[], max: number): T[] {
  const size = Math.ceil(rows.length / max)
  if (size <= 1) return rows
  const out: T[] = []
  for (let i = 0; i < rows.length; i += size) {
    const group = rows.slice(i, i + size)
    const merged: Record<string, unknown> = { ...group[0] }
    for (const key of Object.keys(group[0])) {
      if (key === 'bucket') continue
      const nums = group
        .map((r) => (r as Record<string, unknown>)[key])
        .filter((v): v is number => typeof v === 'number')
      if (typeof group[0][key as keyof T] === 'number' || nums.length) {
        merged[key] = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null
      }
    }
    out.push(merged as T)
  }
  return out
}

/** FNV-1a: a stable number from a string, to seed per-device randomness. */
function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** mulberry32, the same generator the simulator uses. */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type RainFade = 'Low' | 'Moderate' | 'High'

export interface Weather {
  condition: 'Clear' | 'Partly cloudy' | 'Overcast' | 'Haze' | 'Light rain' | 'Heavy rain'
  tempC: number
  feelsC: number
  humidity: number
  windKmh: number
  windDir: string
  cloud: number
  rainMm: number
  /** Rain absorbs Ku-band satellite signal: the one weather fact an operator acts on. */
  rainFade: RainFade
}

/**
 * Simulated weather at a device, until a real weather service is wired in.
 * Deterministic per device and hour, so it doesn't flicker on every poll, and
 * shaped roughly like India in October: the retreating monsoon keeps the
 * north-east and the south-east coast wettest, the north is cooler and hazier.
 */
export function mockWeather(deviceId: string, lat: number, lon: number, now = new Date()): Weather {
  const r = seeded(hashString(deviceId) ^ Math.floor(now.getTime() / 3600e3))
  const wet = lon > 88 ? 0.45 : lat < 15 && lon > 77 ? 0.5 : lat < 20 ? 0.3 : 0.12
  const roll = r()
  const condition: Weather['condition'] =
    roll < wet * 0.35
      ? 'Heavy rain'
      : roll < wet
        ? 'Light rain'
        : roll < wet + 0.22
          ? 'Overcast'
          : roll < wet + 0.5
            ? 'Partly cloudy'
            : lat > 24 && lon < 86 && r() < 0.4
              ? 'Haze'
              : 'Clear'
  const raining = condition === 'Heavy rain' || condition === 'Light rain'
  const ist = (now.getUTCHours() + now.getUTCMinutes() / 60 + 5.5) % 24
  const base = lat > 32 ? 13 : 33 - (lat - 8) * 0.28
  const tempC = base + 4 * Math.sin(((ist - 9) / 24) * 2 * Math.PI) - (raining ? 3 : 0) + (r() - 0.5) * 2
  const humidity = raining ? 82 + r() * 16 : lat < 20 ? 58 + r() * 20 : 32 + r() * 26
  const cloud = { Clear: 5, Haze: 20, 'Partly cloudy': 40, Overcast: 90, 'Light rain': 88, 'Heavy rain': 97 }[condition]
  return {
    condition,
    tempC: Math.round(tempC),
    feelsC: Math.round(tempC + (humidity > 70 ? 2.5 : 0)),
    humidity: Math.round(humidity),
    windKmh: Math.round(6 + r() * 16 + (condition === 'Heavy rain' ? 14 : 0)),
    windDir: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.floor(r() * 8)],
    cloud: Math.round(cloud + (r() - 0.5) * 8),
    rainMm:
      condition === 'Heavy rain'
        ? Math.round(8 + r() * 20)
        : condition === 'Light rain'
          ? Math.round((0.5 + r() * 3) * 10) / 10
          : 0,
    rainFade: condition === 'Heavy rain' ? 'High' : condition === 'Light rain' ? 'Moderate' : 'Low',
  }
}

/** Row click opens the device; modifier clicks are left to the name link (new tab). */
export function openRow(
  { row }: { row: { deviceId: string } },
  event: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean },
) {
  if (event.metaKey || event.ctrlKey || event.shiftKey) return
  location.hash = `#/devices/${encodeURIComponent(row.deviceId)}`
}
