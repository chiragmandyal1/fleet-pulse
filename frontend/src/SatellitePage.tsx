import { Box, CardContent, Stack, Typography, useTheme } from '@mui/material'
import { DeviceLink, Intro, Panel, Section } from './common.tsx'
import { useCallback, useMemo } from 'react'
import { api, type Device } from './api.ts'
import { ago, usePolling } from './lib.ts'

/** Fictional birds; the slot is the longitude each one is parked over. */
const SLOTS: Record<string, string> = { 'Aster-1': '74°E', 'Aster-2': '93.5°E' }

interface Tally {
  devices: number
  online: number
  offline: number
  rfSum: number
  rfCount: number
}

const empty = (): Tally => ({ devices: 0, online: 0, offline: 0, rfSum: 0, rfCount: 0 })

function add(t: Tally, d: Device) {
  t.devices++
  if (d.status === 'online') t.online++
  if (d.status === 'offline') t.offline++
  if (d.rfSignal != null) {
    t.rfSum += d.rfSignal
    t.rfCount++
  }
}

const avgRf = (t: Tally) => (t.rfCount ? (t.rfSum / t.rfCount).toFixed(1) : '—')

/** Online share as a filled track; offline shown in red on the right so both read at once. */
function ShareBar({ t }: { t: Tally }) {
  const { fp } = useTheme().palette
  const on = (t.online / t.devices) * 100
  const off = (t.offline / t.devices) * 100
  return (
    <Box sx={{ display: 'flex', height: 10, borderRadius: 1, overflow: 'hidden', bgcolor: fp.surface }} aria-hidden>
      <Box sx={{ width: `${on}%`, bgcolor: fp.online }} />
      <Box sx={{ flexGrow: 1 }} />
      <Box sx={{ width: `${off}%`, bgcolor: fp.offline }} />
    </Box>
  )
}

const BEAMS = ['North', 'East', 'West', 'South'] as const
const SATELLITE_OF: Record<string, string> = { North: 'Aster-2', East: 'Aster-2', West: 'Aster-1', South: 'Aster-1' }

const GRID = {
  display: 'grid',
  gridTemplateColumns: '64px 1fr 56px 56px 64px',
  gap: 1.5,
  alignItems: 'center',
} as const

export default function SatellitePage({ onLogout }: { onLogout: () => void }) {
  const { fp } = useTheme().palette
  const load = useCallback(() => api<Device[]>('/devices'), [])
  const { data, error } = usePolling(load, onLogout)

  const sats = useMemo(() => {
    const bySat = new Map<string, { total: Tally; beams: Map<string, Tally> }>()
    for (const d of data ?? []) {
      const sat = bySat.get(d.satellite) ?? { total: empty(), beams: new Map() }
      bySat.set(d.satellite, sat)
      add(sat.total, d)
      const beam = sat.beams.get(d.beam) ?? empty()
      sat.beams.set(d.beam, beam)
      add(beam, d)
    }
    return [...bySat].sort(([a], [b]) => a.localeCompare(b))
  }, [data])

  return (
    <Stack spacing={3}>
      <Intro>
        Each terminal is served by one beam on one satellite. When many terminals on one beam drop together, suspect the
        beam or the weather over it, not the sites.
      </Intro>
      {error && <Typography color="error">Couldn't refresh: {error}. Showing the last data received.</Typography>}
      {!data && <Typography color="text.secondary">Loading satellites…</Typography>}
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
        {sats.map(([name, { total, beams }]) => (
          <Panel key={name}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, flexWrap: 'wrap' }}>
                <Typography sx={{ fontWeight: 600, fontSize: '1.5rem', lineHeight: 1.1, letterSpacing: '-0.01em' }}>
                  {name}
                </Typography>
                <Typography color="text.secondary">orbital slot {SLOTS[name] ?? 'unknown'}</Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 4, mt: 2, mb: 3, flexWrap: 'wrap' }}>
                {(
                  [
                    ['Terminals', total.devices, undefined],
                    ['Online', total.online, fp.online],
                    ['Offline', total.offline, fp.offline],
                    ['Avg RF (dB)', avgRf(total), undefined],
                  ] as [string, string | number, string | undefined][]
                ).map(([label, value, color]) => (
                  <Box key={label}>
                    <Typography sx={{ fontWeight: 600, fontSize: '1.45rem', lineHeight: 1.2, color }}>
                      {value}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {label}
                    </Typography>
                  </Box>
                ))}
              </Box>
              <Box
                sx={{
                  ...GRID,
                  color: 'text.secondary',
                  fontSize: '0.85rem',
                  pb: 1,
                  borderBottom: 1,
                  borderColor: 'divider',
                }}
              >
                <span>Beam</span>
                <span>Online share</span>
                <span style={{ textAlign: 'right' }}>Up</span>
                <span style={{ textAlign: 'right' }}>Down</span>
                <span style={{ textAlign: 'right' }}>RF dB</span>
              </Box>
              {[...beams]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([beam, t]) => (
                  <Box
                    key={beam}
                    sx={{
                      ...GRID,
                      py: 1.25,
                      borderBottom: 1,
                      borderColor: 'divider',
                      '&:last-of-type': { borderBottom: 0 },
                    }}
                  >
                    <Typography sx={{ fontWeight: 600 }}>{beam}</Typography>
                    <ShareBar t={t} />
                    <Typography sx={{ textAlign: 'right' }}>{t.online}</Typography>
                    <Typography sx={{ textAlign: 'right', color: t.offline ? fp.offline : 'text.secondary' }}>
                      {t.offline}
                    </Typography>
                    <Typography sx={{ textAlign: 'right' }}>{avgRf(t)}</Typography>
                  </Box>
                ))}
            </CardContent>
          </Panel>
        ))}
      </Box>
      {data && (
        <Section
          title="Down on each beam"
          note="The devices that are offline right now, by the beam that serves them"
          flush
        >
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, minmax(0, 1fr))' },
              borderTop: 1,
              borderColor: 'divider',
            }}
          >
            {BEAMS.map((beam, i) => {
              const down = data.filter((d) => d.beam === beam && d.status === 'offline')
              return (
                <Box
                  key={beam}
                  sx={{
                    px: 2.5,
                    py: 2,
                    // Explicit colours: a responsive border shorthand would reset the colour to currentColor.
                    borderLeft: { lg: i ? `1px solid ${fp.rule}` : 0 },
                    borderTop: { xs: i ? `1px solid ${fp.rule}` : 0, lg: 0 },
                  }}
                >
                  <Typography sx={{ fontWeight: 600, fontSize: 13 }}>
                    {beam}{' '}
                    <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>
                      {SATELLITE_OF[beam]}, {down.length} down
                    </Box>
                  </Typography>
                  {down.length === 0 ? (
                    <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1 }}>
                      Every terminal is reporting.
                    </Typography>
                  ) : (
                    down.slice(0, 6).map((d) => (
                      <Box key={d.deviceId} sx={{ mt: 1, minWidth: 0 }}>
                        <DeviceLink id={d.deviceId}>
                          <Typography noWrap component="span" sx={{ fontSize: 13, display: 'block' }}>
                            {d.name}
                          </Typography>
                        </DeviceLink>
                        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                          {d.deviceId}, last report {ago(d.lastSeen)}
                        </Typography>
                      </Box>
                    ))
                  )}
                  {down.length > 6 && (
                    <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1 }}>
                      and {down.length - 6} more
                    </Typography>
                  )}
                </Box>
              )
            })}
          </Box>
        </Section>
      )}
    </Stack>
  )
}
