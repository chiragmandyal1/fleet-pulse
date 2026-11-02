import 'leaflet/dist/leaflet.css'
import { Box } from '@mui/material'
import { divIcon } from 'leaflet'
import { MapContainer, Marker, Polygon, Polyline } from 'react-leaflet'
import type { Device } from './api.ts'
import { DOT_ICONS, GRID_MAJOR, GRID_MINOR, mapPalette, mapSx, OUTLINE, STATES } from './geo.ts'
import { useMode } from './mode.ts'

/** Amber ring around the device so it reads at a glance among state lines. */
const LOCATOR = divIcon({ className: 'fp-locate', iconSize: [26, 26] })

/**
 * A still locator for one device: the fleet map's blueprint drawing, zoomed to
 * the device's surroundings. Not interactive; the dashboard map is for exploring.
 */
export default function DeviceMap({ device, height = 210 }: { device: Device; height?: number }) {
  const { mode } = useMode()
  const C = mapPalette(mode)
  return (
    <Box
      sx={{
        ...mapSx(mode),
        position: 'relative',
        height,
        overflow: 'hidden',
        bgcolor: C.ground,
        '& .leaflet-container': { height: '100%', bgcolor: C.ground, cursor: 'default' },
        '& .fp-locate': { borderRadius: '50%', border: `1.5px solid ${C.amber}`, boxSizing: 'border-box' },
      }}
    >
      <MapContainer
        key={device.deviceId}
        center={[device.lat, device.lon]}
        zoom={6.5}
        zoomSnap={0.25}
        zoomControl={false}
        attributionControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        boxZoom={false}
        keyboard={false}
      >
        <Polyline
          positions={GRID_MINOR}
          pathOptions={{ color: C.grid, opacity: 0.04, weight: 1 }}
          interactive={false}
        />
        <Polyline
          positions={GRID_MAJOR}
          pathOptions={{ color: C.grid, opacity: 0.12, weight: 1 }}
          interactive={false}
        />
        <Polygon
          positions={OUTLINE}
          pathOptions={{ color: C.coast, weight: 1.1, fillColor: C.land, fillOpacity: 1 }}
          interactive={false}
        />
        {STATES.map((st) => (
          <Polygon
            key={st.name}
            positions={st.rings}
            pathOptions={{ color: C.coast, opacity: 0.45, weight: 0.8, fill: false }}
            interactive={false}
          />
        ))}
        <Marker position={[device.lat, device.lon]} icon={LOCATOR} interactive={false} keyboard={false} />
        <Marker
          position={[device.lat, device.lon]}
          icon={DOT_ICONS.get(`${device.status}-0`)!}
          interactive={false}
          keyboard={false}
        />
      </MapContainer>
    </Box>
  )
}
