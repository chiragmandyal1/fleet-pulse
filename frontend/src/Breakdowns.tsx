import { Box, Typography, useTheme } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useMemo } from 'react'
import type { Customer, Device } from './api.ts'
import { Section } from './common.tsx'
import { stateAt } from './geo.ts'
import { HEADING } from './theme.ts'

/** A device never changes state name unless it moves; the ray casting over every outline is worth caching. */
const regionCache = new Map<string, string | null>()
function regionOf(d: Device): string {
  const key = `${d.lat.toFixed(3)},${d.lon.toFixed(3)}`
  if (!regionCache.has(key)) {
    if (regionCache.size > 2000) regionCache.clear()
    regionCache.set(key, stateAt(d.lat, d.lon))
  }
  return regionCache.get(key) ?? 'Other regions'
}

/** Short sector codes (IT) stay capitals; longer words get a leading capital. */
const sectorLabel = (s: string) => (s.length <= 3 ? s.toUpperCase() : s.charAt(0).toUpperCase() + s.slice(1))

/** One slim bar split into online, silent and offline, with a minimum sliver so a single outage still shows. */
function SegBar({ online, unknown, offline }: { online: number; unknown: number; offline: number }) {
  const { fp } = useTheme().palette
  const segs = [
    { n: online, color: fp.online },
    { n: unknown, color: fp.unknown },
    { n: offline, color: fp.offline },
  ].filter((g) => g.n > 0)
  return (
    <Box sx={{ display: 'flex', gap: '2px', height: 6 }} aria-hidden>
      {segs.map((g) => (
        <Box key={g.color} sx={{ flex: g.n, minWidth: 4, borderRadius: 999, bgcolor: g.color }} />
      ))}
    </Box>
  )
}

/** Each customer's own slice of the fleet, the most affected first. */
export function CustomerHealth({ devices, customers }: { devices: Device[]; customers: Customer[] }) {
  const { fp } = useTheme().palette
  const rows = useMemo(
    () =>
      customers
        .map((c) => {
          const mine = devices.filter((d) => d.customerId === c.customerId)
          const count = (s: Device['status']) => mine.filter((d) => d.status === s).length
          return { ...c, total: mine.length, online: count('online'), offline: count('offline'), unknown: count('unknown') }
        })
        .filter((r) => r.total > 0)
        .sort((a, b) => b.offline / b.total - a.offline / a.total || b.total - a.total),
    [devices, customers],
  )
  return (
    <Section title="Customers" note="Live status of each customer's devices, most affected first">
      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {rows.length === 0 && <Typography sx={{ color: 'text.secondary' }}>Loading…</Typography>}
        {rows.map((r) => (
          <Box
            key={r.customerId}
            sx={{
              p: 1.75,
              minWidth: 0,
              borderRadius: '10px',
              border: 1,
              borderColor: 'divider',
              bgcolor: alpha(fp.text, 0.025),
              display: 'grid',
              gap: 1.25,
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography noWrap title={r.name} sx={{ fontWeight: 600, fontSize: 14 }}>
                {r.name}
              </Typography>
              <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary' }}>
                {sectorLabel(r.sector)}
              </Typography>
            </Box>
            <SegBar online={r.online} unknown={r.unknown} offline={r.offline} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                <Box component="span" sx={{ fontFamily: HEADING, fontWeight: 600, fontSize: 16, color: 'text.primary' }}>
                  {r.online}
                </Box>{' '}
                of {r.total} online
              </Typography>
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: r.offline ? fp.offline : fp.online }}>
                {r.offline ? `${r.offline} down` : 'all up'}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Section>
  )
}

/** The states with the most devices down right now. */
export function RegionRanking({ devices }: { devices: Device[] }) {
  const { fp } = useTheme().palette
  const { rows, anyDown } = useMemo(() => {
    const by = new Map<string, { total: number; offline: number }>()
    for (const d of devices) {
      const k = regionOf(d)
      const r = by.get(k) ?? { total: 0, offline: 0 }
      r.total++
      if (d.status === 'offline') r.offline++
      by.set(k, r)
    }
    const all = [...by.entries()].map(([name, r]) => ({ name, ...r }))
    return {
      anyDown: all.some((r) => r.offline > 0),
      rows: all.sort((a, b) => b.offline - a.offline || b.total - a.total).slice(0, 6),
    }
  }, [devices])
  const top = Math.max(1, ...rows.map((r) => r.offline))
  return (
    <Section title="Worst regions" note={anyDown ? 'States with the most devices down right now' : 'Nothing is down; the busiest states'}>
      <Box sx={{ display: 'grid', gap: 1.75 }}>
        {rows.length === 0 && <Typography sx={{ color: 'text.secondary' }}>Loading…</Typography>}
        {rows.map((r) => (
          <Box key={r.name} sx={{ display: 'grid', gap: 0.75 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1 }}>
              <Typography noWrap sx={{ fontSize: 13, fontWeight: 500 }}>
                {r.name}
              </Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', flex: 'none' }}>
                <Box component="span" sx={{ fontFamily: HEADING, fontWeight: 600, fontSize: 15, color: r.offline ? fp.offline : 'text.primary' }}>
                  {r.offline}
                </Box>{' '}
                down of {r.total}
              </Typography>
            </Box>
            <Box sx={{ height: 6, borderRadius: 999, bgcolor: alpha(fp.text, 0.07), overflow: 'hidden' }} aria-hidden>
              <Box
                sx={{
                  width: `${(r.offline / top) * 100}%`,
                  height: '100%',
                  borderRadius: 999,
                  bgcolor: fp.offline,
                  boxShadow: `0 0 10px ${alpha(fp.offline, 0.5)}`,
                  transition: 'width .5s ease',
                }}
              />
            </Box>
          </Box>
        ))}
      </Box>
    </Section>
  )
}
