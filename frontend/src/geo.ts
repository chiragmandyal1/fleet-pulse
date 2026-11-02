import { divIcon, type LatLngTuple } from 'leaflet'
import type { LinkStatus } from './api.ts'
import india from './india.json'
import statesData from './states.json'
import type { Mode } from './theme.ts'

/**
 * The map is a drawn chart, not tiles, and it follows the theme: a deep navy
 * instrument at night, a pale chart with white land by day.
 */
export interface MapColors {
  ground: string
  land: string
  coast: string
  amber: string
  grid: string
  text: string
  muted: string
  rule: string
  /** Floating pieces on the map (tooltips, zoom buttons). */
  panel: string
  hover: string
  /** The soft darkening toward the map's edges. */
  vignette: string
  status: Record<LinkStatus, string>
}

const MAP_COLORS: Record<Mode, MapColors> = {
  dark: {
    ground: '#080d17',
    land: '#101a2b',
    coast: '#3f6a96',
    amber: '#f2b33d',
    grid: '#7fb4ff',
    text: '#e9eef7',
    muted: '#7d8aa1',
    rule: '#1b2538',
    panel: 'rgba(13, 19, 32, 0.92)',
    hover: 'rgba(76, 201, 240, 0.14)',
    vignette: 'rgba(5, 8, 14, 0.55)',
    status: { online: '#2fd6a1', offline: '#ff5a76', unknown: '#7d8aa1' },
  },
  light: {
    ground: '#dde7f3',
    land: '#fbfcfe',
    coast: '#6f93bd',
    amber: '#c98a12',
    grid: '#2f5f94',
    text: '#0b1220',
    muted: '#5b6b84',
    rule: '#c5d2e4',
    panel: 'rgba(255, 255, 255, 0.94)',
    hover: 'rgba(10, 122, 168, 0.1)',
    vignette: 'rgba(110, 140, 185, 0.22)',
    status: { online: '#0d8f63', offline: '#d52b4a', unknown: '#64708a' },
  },
}

export const mapPalette = (mode: Mode) => MAP_COLORS[mode]

/**
 * India's official outline (datameet's composite boundary, simplified to ~2 km).
 * Only India is drawn; the grid carries on across the rest of the panel.
 */
export const OUTLINE: LatLngTuple[][] = (india as number[][][]).map((ring) => ring.map(([lon, lat]) => [lat, lon]))

/**
 * States and union territories (datameet, simplified to ~2.5 km). The data
 * predates the 2019 Ladakh split and the 2020 Dadra/Daman merger.
 */
export const STATES = (
  statesData as { name: string; rings: number[][][]; label: [number, number]; area: number }[]
).map((st) => ({
  name: st.name,
  rings: st.rings.map((ring) => ring.map(([lon, lat]): LatLngTuple => [lat, lon])),
  label: st.label,
  /** Square degrees: decides when there is room to print the name. */
  area: st.area,
}))

/**
 * Graticule lines every `step` degrees across the whole globe (Mercator stops
 * near ±85°), so the grid always runs past the panel edges, however wide the
 * screen or wherever the view is panned.
 */
export const GRID_LAT = 80
export function graticule(step: number): LatLngTuple[][] {
  const lines: LatLngTuple[][] = []
  for (let lon = -180; lon <= 180; lon += step)
    lines.push([
      [-GRID_LAT, lon],
      [GRID_LAT, lon],
    ])
  for (let lat = -GRID_LAT; lat <= GRID_LAT; lat += step)
    lines.push([
      [lat, -180],
      [lat, 180],
    ])
  return lines
}
export const GRID_MINOR = graticule(2)
export const GRID_MAJOR = graticule(10)

/** Stacking: an offline marker must never hide under a healthy one. */
export const Z_OFFSET: Record<LinkStatus, number> = { online: 0, unknown: 500, offline: 1000 }

/** Dot diameter in px: offline and silent devices are drawn larger. */
export const DOT: Record<LinkStatus, number> = { online: 8, unknown: 11, offline: 11 }

/**
 * Device dots are Leaflet markers with CSS-drawn icons rather than vector
 * circles. Markers keep their pixel size through a zoom animation; vector
 * circles get stretched with the map and then snap back, which reads as a
 * glitch. Offline icons carry the pulse ring, in six staggered phases so
 * neighbouring rings don't throb together. Icons are built once and shared.
 */
export const DOT_ICONS = new Map(
  (['online', 'unknown', 'offline'] as LinkStatus[]).flatMap((status) =>
    Array.from({ length: status === 'offline' ? 6 : 1 }, (_, phase) => [
      `${status}-${phase}`,
      divIcon({
        className: `fp-dot fp-dot-${status}`,
        iconSize: [DOT[status], DOT[status]],
        html: status === 'offline' ? `<span class="fp-ring" style="animation-delay:${phase * 0.35}s"></span>` : '',
      }),
    ]),
  ),
)

/**
 * Styles every Fleet Pulse map shares: dark container, CSS-drawn device dots,
 * the offline pulse ring, state-name labels and the square tooltip. Spread into
 * the sx of the box that wraps a MapContainer.
 */
export function mapSx(mode: Mode) {
  const C = MAP_COLORS[mode]
  const glow = mode === 'dark' ? 1 : 0.55
  return {
  // Its own stacking context: Leaflet's panes sit at z-index 400-1000, and without this they
  // paint over the sticky top bar when the page scrolls.
  isolation: 'isolate',
  '& .leaflet-container': { height: '100%', bgcolor: C.ground, fontFamily: 'inherit', cursor: 'grab' },
  '& .leaflet-dragging .leaflet-container, &.leaflet-dragging': { cursor: 'grabbing' },
  '& .fp-dot': {
    borderRadius: '50%',
    border: `1.4px solid ${C.ground}`,
    boxSizing: 'border-box',
    cursor: 'pointer',
  },
  '& .fp-dot-online': { background: C.status.online, boxShadow: `0 0 ${7 * glow}px ${C.status.online}` },
  '& .fp-dot-unknown': { background: C.status.unknown, boxShadow: `0 0 ${7 * glow}px ${C.status.unknown}` },
  '& .fp-dot-offline': { background: C.status.offline, boxShadow: `0 0 ${14 * glow}px ${2 * glow}px ${C.status.offline}` },
  // Offline devices pulse: a ring that grows and fades. Off for reduced motion.
  '& .fp-ring': {
    position: 'absolute',
    inset: -1.5,
    borderRadius: '50%',
    border: `1.5px solid ${C.status.offline}`,
    animation: 'fp-ring 2.2s ease-out infinite',
    pointerEvents: 'none',
  },
  '@keyframes fp-ring': {
    from: { transform: 'scale(1)', opacity: 0.9 },
    to: { transform: 'scale(3)', opacity: 0 },
  },
  '@media (prefers-reduced-motion: reduce)': {
    '& .fp-ring': { animation: 'none', transform: 'scale(1.6)', opacity: 0.6 },
  },
  '& .fp-state span': {
    position: 'absolute',
    transform: 'translate(-50%, -50%)',
    fontSize: 11,
    whiteSpace: 'nowrap',
    color: C.muted,
    opacity: 0.75,
  },
  '& .leaflet-tooltip.fp-tip': {
    borderRadius: '8px',
    bgcolor: C.panel,
    color: C.text,
    border: `1px solid ${C.rule}`,
    boxShadow: mode === 'dark' ? '0 8px 24px rgba(0,0,0,.5)' : '0 8px 24px rgba(30,50,90,.18)',
    backdropFilter: 'blur(6px)',
    p: '8px 10px',
    fontSize: 12,
    lineHeight: 1.45,
    '&::before': { display: 'none' },
  },
  }
}

/** Which state or union territory a point falls in (ray casting over the simplified outlines). */
export function stateAt(lat: number, lon: number): string | null {
  const inside = (ring: LatLngTuple[]) => {
    let hit = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [yi, xi] = ring[i]
      const [yj, xj] = ring[j]
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit
    }
    return hit
  }
  return STATES.find((st) => st.rings.some(inside))?.name ?? null
}
