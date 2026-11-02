import 'leaflet/dist/leaflet.css'
import { Box } from '@mui/material'
import { divIcon, type LatLngBoundsExpression, type Map as LeafletMap } from 'leaflet'
import { useEffect, useState } from 'react'
import { MapContainer, Marker, Pane, Polygon, Polyline, Tooltip } from 'react-leaflet'
import type { Device } from './api.ts'
import { Icon } from './common.tsx'
import { DOT_ICONS, GRID_MAJOR, GRID_MINOR, GRID_LAT, mapPalette, mapSx, OUTLINE, STATES, Z_OFFSET } from './geo.ts'
import { useMode } from './mode.ts'
import { ago } from './lib.ts'

/** India's bounding box with a small margin: the view opens on it and can't zoom out past it. */
const REGION: LatLngBoundsExpression = [
  [6.2, 67.6],
  [37.6, 97.9],
]
/** How far the view may be dragged: enough to inspect the coasts, never enough to lose India. */
const PAN_LIMIT: LatLngBoundsExpression = [
  [-2, 58],
  [44, 108],
]

/** Tight fit, clear of the controls on the right, so India fills the panel. */
const FIT_PADDING = { paddingTopLeft: [12, 12] as [number, number], paddingBottomRight: [50, 12] as [number, number] }

const ICON_PLUS = 'M5 12h14M12 5v14'
const ICON_MINUS = 'M5 12h14'
const ICON_FIT = 'M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5'

interface EdgeLabel {
  key: string
  text: string
  x: number
  y: number
}

/**
 * Each state name is a Leaflet marker with a text-only icon, so it lives inside
 * the map and moves with it through zoom animations instead of floating over it.
 * Names come from the bundled dataset, never from users, so the HTML is safe.
 */
const STATE_ICONS = new Map(
  STATES.map((st) => [st.name, divIcon({ className: 'fp-state', html: `<span>${st.name}</span>`, iconSize: [0, 0] })]),
)

/**
 * Names printed only where the state is big enough on screen to hold them:
 * large states at the furthest zoom, small ones (Sikkim, Goa, the north-east)
 * as you zoom in. Depends on zoom only, so it is recomputed when a zoom ends.
 */
function visibleStates(map: LeafletMap): Set<string> {
  const ppd = map.latLngToContainerPoint([20, 81]).x - map.latLngToContainerPoint([20, 80]).x
  return new Set(STATES.filter((st) => Math.sqrt(st.area) * ppd > st.name.length * 5.2).map((st) => st.name))
}

/** Degree labels on the left and bottom edges, kept in line with the grid as the view moves. */
function edgeLabels(map: LeafletMap): EdgeLabel[] {
  const { x: w, y: h } = map.getSize()
  const out: EdgeLabel[] = []
  for (let lat = -GRID_LAT; lat <= GRID_LAT; lat += 10) {
    const y = map.latLngToContainerPoint([lat, 80]).y
    if (y > 14 && y < h - 20)
      out.push({ key: `lat${lat}`, text: `${Math.abs(lat)}°${lat >= 0 ? 'N' : 'S'}`, x: 6, y: y - 14 })
  }
  for (let lon = -180; lon <= 180; lon += 10) {
    const x = map.latLngToContainerPoint([20, lon]).x
    // Right margin keeps labels clear of the boundary credit in the corner.
    if (x > 30 && x < w - 175)
      out.push({
        key: `lon${lon}`,
        text: lon === 0 || Math.abs(lon) === 180 ? `${Math.abs(lon)}°` : `${Math.abs(lon)}°${lon > 0 ? 'E' : 'W'}`,
        x: x + 4,
        y: h - 18,
      })
  }
  return out
}

export default function FleetMap({ devices, height = 440 }: { devices: Device[]; height?: number | string }) {
  const { mode } = useMode()
  const C = mapPalette(mode)
  const [map, setMap] = useState<LeafletMap | null>(null)
  const [labels, setLabels] = useState<EdgeLabel[]>([])
  const [named, setNamed] = useState<Set<string>>(new Set())
  /** Edge labels are drawn over the map, so they hide while a zoom animates. */
  const [zooming, setZooming] = useState(false)

  // Open fitted to India, and keep that as the furthest-out zoom. Recomputed when
  // the panel itself resizes (not only the window); a zoom below it snaps back.
  useEffect(() => {
    if (!map) return
    const fit = () => map.fitBounds(REGION, FIT_PADDING)
    const lock = () => {
      const floor = map.getBoundsZoom(REGION)
      map.setMinZoom(floor)
      map.setMaxZoom(floor + 3.3) // ~10x, as in the design
      if (map.getZoom() < floor) map.setZoom(floor)
    }
    const relabel = () => setLabels(edgeLabels(map))
    const rename = () => setNamed(visibleStates(map))
    const zoomStart = () => setZooming(true)
    const zoomEnd = () => {
      setZooming(false)
      relabel()
      rename()
    }
    fit()
    lock()
    relabel()
    rename()
    // Set once the user pans or zooms: until then a resize refits India instead of keeping a stale view.
    const el = map.getContainer()
    const touch = () => (el.dataset.touched = '1')
    el.addEventListener('pointerdown', touch)
    el.addEventListener('wheel', touch, { passive: true })
    el.addEventListener('keydown', touch)
    const observer = new ResizeObserver(() => {
      map.invalidateSize()
      // The panel can settle at its real size after the first fit (fonts, a phone's
      // late layout); refit until the user has moved the map themselves.
      if (!el.dataset.touched) fit()
      lock()
      relabel()
      rename()
    })
    observer.observe(map.getContainer())
    map.on('zoomend', lock)
    map.on('move', relabel)
    map.on('zoomstart', zoomStart)
    map.on('zoomend', zoomEnd)
    return () => {
      el.removeEventListener('pointerdown', touch)
      el.removeEventListener('wheel', touch)
      el.removeEventListener('keydown', touch)
      observer.disconnect()
      map.off('zoomend', lock)
      map.off('move', relabel)
      map.off('zoomstart', zoomStart)
      map.off('zoomend', zoomEnd)
    }
  }, [map])

  // A zoom button counts as the user moving the map, so later resizes leave their view alone.
  const zoomIn = () => {
    if (!map) return
    map.getContainer().dataset.touched = '1'
    map.zoomIn(0.7)
  }
  const zoomOut = () => {
    if (!map) return
    map.getContainer().dataset.touched = '1'
    map.zoomOut(0.7)
  }

  const control = (label: string, d: string, onClick: () => void) => (
    <Box
      component="button"
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      sx={{
        width: 32,
        height: 32,
        display: 'grid',
        placeItems: 'center',
        p: 0,
        mt: '-1px',
        cursor: 'pointer',
        color: C.text,
        bgcolor: C.panel,
        border: `1px solid ${C.rule}`,
        '&:first-of-type': { borderRadius: '8px 8px 0 0' },
        '&:last-of-type': { borderRadius: '0 0 8px 8px' },
        '&:hover': { bgcolor: C.hover },
        '&:focus-visible': { outline: `1px solid ${C.amber}`, outlineOffset: -1 },
      }}
    >
      <Icon d={d} size={16} />
    </Box>
  )

  return (
    <Box
      sx={{
        position: 'relative',
        height,
        overflow: 'hidden',
        bgcolor: C.ground,
        ...mapSx(mode),
      }}
    >
      <MapContainer
        ref={setMap}
        center={[22, 80]}
        zoom={4}
        zoomSnap={0.25}
        zoomControl={false}
        attributionControl={false}
        // Wheel and trackpad pinch (which browsers send as ctrl+wheel) both zoom.
        scrollWheelZoom
        wheelPxPerZoomLevel={90}
        maxBounds={PAN_LIMIT}
        maxBoundsViscosity={1}
      >
        {/* Base drawing in its own pane under the names (390) and the dots (overlay, 400):
            otherwise the filled land would cover every label. */}
        <Pane name="base" style={{ zIndex: 350 }}>
          <Polyline
            positions={GRID_MINOR}
            pathOptions={{ color: C.grid, opacity: 0.05, weight: 1 }}
            interactive={false}
          />
          <Polyline
            positions={GRID_MAJOR}
            pathOptions={{ color: C.grid, opacity: 0.13, weight: 1 }}
            interactive={false}
          />
          <Polygon
            positions={OUTLINE}
            pathOptions={{ color: C.coast, weight: 1.4, fillColor: C.land, fillOpacity: 1 }}
            interactive={false}
          />
          {/* State borders, dashed like the design's internal borders, always on. */}
          {STATES.map((st) => (
            <Polygon
              key={st.name}
              positions={st.rings}
              pathOptions={{ color: C.coast, opacity: 0.45, weight: 0.8, fill: false }}
              interactive={false}
            />
          ))}
        </Pane>
        {/* Names sit in their own pane under the dots (overlay pane is 400), so a
            device is never hidden behind a label. */}
        <Pane name="state-labels" style={{ zIndex: 390, pointerEvents: 'none' }}>
          {STATES.filter((st) => named.has(st.name)).map((st) => (
            <Marker
              key={st.name}
              position={st.label}
              icon={STATE_ICONS.get(st.name)!}
              interactive={false}
              keyboard={false}
            />
          ))}
        </Pane>
        {devices.map((d, i) => (
          <Marker
            key={d.deviceId}
            position={[d.lat, d.lon]}
            icon={DOT_ICONS.get(`${d.status}-${d.status === 'offline' ? i % 6 : 0}`)!}
            zIndexOffset={Z_OFFSET[d.status]}
            keyboard={false}
            eventHandlers={{ click: () => (location.hash = `#/devices/${d.deviceId}`) }}
          >
            <Tooltip direction="top" offset={[0, -8]} className="fp-tip">
              <Box sx={{ fontWeight: 600, fontSize: 13 }}>{d.name}</Box>
              <Box sx={{ color: C.muted }}>
                {d.deviceId}, {d.status}, {ago(d.lastSeen)}
              </Box>
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>

      {/* A soft vignette so the map sinks into the panel instead of ending in a hard rectangle. */}
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          inset: 0,
          zIndex: 450,
          pointerEvents: 'none',
          background: `radial-gradient(ellipse at 50% 45%, transparent 55%, ${C.vignette} 100%)`,
        }}
      />

      {!zooming &&
        labels.map((l) => (
          <Box
            key={l.key}
            component="span"
            aria-hidden
            sx={{
              position: 'absolute',
              left: l.x,
              top: l.y,
              zIndex: 500,
              fontSize: 11,
              color: C.muted,
              pointerEvents: 'none',
            }}
          >
            {l.text}
          </Box>
        ))}

      <Box sx={{ position: 'absolute', right: 12, top: 12, zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
        {control('Zoom in', ICON_PLUS, zoomIn)}
        {control('Zoom out', ICON_MINUS, zoomOut)}
        {control('Fit India', ICON_FIT, () => map?.fitBounds(REGION, FIT_PADDING))}
      </Box>
      <Box
        component="span"
        sx={{
          position: 'absolute',
          right: 12,
          bottom: 6,
          zIndex: 500,
          fontSize: 11,
          color: C.muted,
        }}
      >
        Boundary: datameet
      </Box>
    </Box>
  )
}
