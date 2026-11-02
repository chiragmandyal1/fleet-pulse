import { Alert, Box, Button, Link, Stack, TextField, Typography, useTheme } from '@mui/material'
import { BarChart } from '@mui/x-charts/BarChart'
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine'
import { useCallback, useState, type FormEvent, type ReactNode } from 'react'
import { api, type Customer, type Device, type Disconnection, type User } from './api.ts'
import { HoursToggle, Icon, KpiStrip, Label, Pill, Section, StatusChip, SubHeader, TrendChart } from './common.tsx'
import DeviceMap from './DeviceMap.tsx'
import { stateAt } from './geo.ts'
import { ICONS } from './icons.ts'
import { ago, dateTime, downsample, duration, mockWeather, usePolling, WINDOWS, type RainFade } from './lib.ts'

interface Bucket {
  bucket: string
  availability: number
  avgBandwidth: number | null
  avgRfSignal: number | null
  samples: number
}

const round1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10)

function ThresholdEditor({ device, onSaved }: { device: Device; onSaved: () => void }) {
  const [value, setValue] = useState(String(device.rfThreshold))
  const [result, setResult] = useState<{ ok: boolean; text: string }>()

  async function save(e: FormEvent) {
    e.preventDefault()
    try {
      await api(`/devices/${encodeURIComponent(device.deviceId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ rfThreshold: Number(value) }),
      })
      setResult({ ok: true, text: 'Saved' })
      onSaved()
    } catch (err) {
      setResult({ ok: false, text: (err as Error).message })
    }
  }

  return (
    <Stack component="form" direction="row" spacing={1} onSubmit={save} sx={{ alignItems: 'center' }}>
      <TextField
        size="small"
        type="number"
        name="rfThreshold"
        label="RF threshold (dB)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        slotProps={{ htmlInput: { step: 0.5, min: 0, max: 20, inputMode: 'decimal' } }}
        sx={{ width: 170 }}
      />
      <Button type="submit" variant="outlined">
        Save
      </Button>
      {result && (
        <Typography variant="body2" role="status" color={result.ok ? 'success.main' : 'error.main'}>
          {result.text}
        </Typography>
      )}
    </Stack>
  )
}

/** Label/value rows: the side panels' list format. */
function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <Box
      component="dl"
      sx={{
        m: 0,
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr)',
        columnGap: 2,
        rowGap: 0.75,
        fontSize: 14,
      }}
    >
      {rows.map(([k, v]) => (
        <Box key={k} sx={{ display: 'contents' }}>
          <Box component="dt" sx={{ color: 'text.secondary' }}>
            {k}
          </Box>
          <Box component="dd" sx={{ m: 0, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>
            {v}
          </Box>
        </Box>
      ))}
    </Box>
  )
}

/** One big readout: tracked label over a condensed figure, with an optional line under it. */
function Readout({
  label,
  value,
  unit,
  color,
  hint,
}: {
  label: string
  value: string
  unit?: string
  color?: string
  hint?: ReactNode
}) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Label>{label}</Label>
      <Typography sx={{ fontWeight: 600, fontSize: 24, lineHeight: 1.2, mt: 0.25, color }}>
        {value}
        {unit && (
          <Box component="span" sx={{ fontSize: 13, ml: 0.5, color: 'text.secondary', fontWeight: 400 }}>
            {unit}
          </Box>
        )}
      </Typography>
      {hint && <Box sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>{hint}</Box>}
    </Box>
  )
}

/** RF margin against threshold as a bar from a centre line: right is headroom, left is below threshold. */
function MarginBar({ margin, color }: { margin: number; color: string }) {
  const { fp } = useTheme().palette
  const pct = (Math.min(Math.abs(margin), 8) / 8) * 50
  return (
    <Box sx={{ position: 'relative', height: 6, bgcolor: fp.surface, mt: 1 }} aria-hidden>
      <Box sx={{ position: 'absolute', left: '50%', top: -3, bottom: -3, width: '1px', bgcolor: fp.muted }} />
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          bgcolor: color,
          width: `${pct}%`,
          ...(margin < 0 ? { right: '50%' } : { left: '50%' }),
        }}
      />
    </Box>
  )
}

/** Availability target: at or above this a period counts as healthy. */
const TARGET = 0.99

/**
 * Rolls 5-minute buckets into wider periods for the availability bars, weighted
 * by sample count: 30 min over 6h, hourly over 24h, 6-hourly over 7 days, daily over 30.
 */
function availabilityBars(buckets: Bucket[], hours: number) {
  const span = (hours <= 6 ? 30 : hours <= 24 ? 60 : hours <= 168 ? 360 : 1440) * 60e3
  const groups = new Map<number, { up: number; n: number }>()
  for (const b of buckets) {
    const key = Math.floor(new Date(b.bucket).getTime() / span) * span
    const g = groups.get(key) ?? { up: 0, n: 0 }
    g.up += b.availability * b.samples
    g.n += b.samples
    groups.set(key, g)
  }
  return [...groups].sort(([a], [b]) => a - b).map(([t, g]) => ({ at: new Date(t), pct: g.n ? (g.up / g.n) * 100 : 0 }))
}

/** min / avg / max of the non-null values, or null when there are none. */
function stats(values: (number | null)[]) {
  const v = values.filter((x): x is number => x != null)
  if (!v.length) return null
  return { min: Math.min(...v), avg: v.reduce((a, b) => a + b, 0) / v.length, max: Math.max(...v) }
}

export default function DevicePage({
  deviceId,
  user,
  onLogout,
}: {
  deviceId: string
  user: User
  onLogout: () => void
}) {
  const { palette } = useTheme()
  const { fp } = palette
  const [hours, setHours] = useState(24)
  const path = `/devices/${encodeURIComponent(deviceId)}`

  const loadDevice = useCallback(() => api<Device>(path), [path])
  const loadHistory = useCallback(() => api<Bucket[]>(`${path}/telemetry?hours=${hours}`), [path, hours])
  const loadDrops = useCallback(
    () => api<Disconnection[]>(`/disconnections?hours=${hours}&deviceId=${encodeURIComponent(deviceId)}`),
    [deviceId, hours],
  )
  const loadCustomers = useCallback(() => api<Customer[]>('/customers'), [])
  const device = usePolling(loadDevice, onLogout)
  const history = usePolling(loadHistory, onLogout)
  const drops = usePolling(loadDrops, onLogout)
  const customers = usePolling(loadCustomers, onLogout)

  const d = device.data
  const buckets = history.data ?? []
  const chart = downsample(buckets, 96)
  const x = chart.map((b) => new Date(b.bucket))
  const samples = buckets.reduce((n, b) => n + b.samples, 0)
  const availability = samples ? buckets.reduce((n, b) => n + b.availability * b.samples, 0) / samples : null
  const windowLabel = WINDOWS.find((w) => w.hours === hours)?.label
  const state = d ? stateAt(d.lat, d.lon) : null
  const weather = d ? mockWeather(d.deviceId, d.lat, d.lon) : null
  const customer = customers.data?.find((c) => c.customerId === d?.customerId)?.name ?? d?.customerId
  const recent = drops.data ?? []
  const bars = availabilityBars(buckets, hours)
  const rf = stats(buckets.map((b) => b.avgRfSignal))
  const bw = stats(buckets.map((b) => b.avgBandwidth))
  const downSec = recent.reduce((n, e) => n + e.durationSec, 0)
  const longest = recent.reduce((m, e) => Math.max(m, e.durationSec), 0)
  // Online since the end of the newest finished drop; down since the start of an open one.
  const openDrop = recent.find((e) => e.end === null)
  const lastEnd = recent.find((e) => e.end !== null)?.end

  if (!d) {
    return (
      <Stack spacing={2}>
        <Back />
        {device.error ? (
          <Alert severity="error">{device.error}</Alert>
        ) : (
          <Typography color="text.secondary">Loading…</Typography>
        )}
      </Stack>
    )
  }

  const margin = d.rfSignal == null ? null : d.rfSignal - d.rfThreshold
  const marginColor = margin == null ? fp.unknown : margin < 0 ? fp.degraded : fp.online
  const fadeColor: Record<RainFade, string> = { Low: fp.online, Moderate: fp.degraded, High: fp.offline }
  const empty = (
    <Typography sx={{ py: 8, textAlign: 'center', color: 'text.secondary' }}>
      {history.data ? 'No telemetry in this window yet.' : 'Loading…'}
    </Typography>
  )

  return (
    <Stack spacing={2.75}>
      <Back />
      {device.error && (
        <Alert severity="warning">Couldn't refresh ({device.error}). Showing the last data received.</Alert>
      )}

      <Box
        sx={{
          display: 'flex',
          gap: 2,
          justifyContent: 'space-between',
          alignItems: { md: 'center' },
          flexDirection: { xs: 'column', md: 'row' },
        }}
      >
        <Box>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography component="h2" sx={{ fontWeight: 600, fontSize: 22, lineHeight: 1.25 }}>
              {d.name}
            </Typography>
            <StatusChip status={d.status} />
          </Box>
          <Typography sx={{ fontSize: 14, color: 'text.secondary', mt: 0.5 }}>
            {d.kind[0].toUpperCase() + d.kind.slice(1)} terminal at {d.site}
            {state ? `, ${state}` : ''}. Last report {ago(d.lastSeen)}.
          </Typography>
        </Box>
        {user.role === 'admin' && <ThresholdEditor device={d} onSaved={device.reload} />}
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: 2.75,
          alignItems: 'start',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 380px' },
        }}
      >
        {/* Side panel first in the source so phones show current state before history. */}
        <Stack spacing={2.75} sx={{ order: { lg: 2 } }}>
          <Section title="Now" note="Latest report from the device">
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2.5, pb: 1 }}>
              <Readout label="Bandwidth" value={d.bandwidth == null ? '—' : d.bandwidth.toFixed(1)} unit="Mbps" />
              <Box>
                <Readout
                  label="RF signal"
                  value={d.rfSignal == null ? '—' : d.rfSignal.toFixed(1)}
                  unit="dB"
                  color={margin != null && margin < 0 ? fp.degraded : undefined}
                  hint={
                    margin == null
                      ? `threshold ${d.rfThreshold} dB`
                      : `${margin >= 0 ? '+' : ''}${margin.toFixed(1)} dB vs ${d.rfThreshold} dB threshold`
                  }
                />
                {margin != null && <MarginBar margin={margin} color={marginColor} />}
              </Box>
              <Readout
                label={`Availability, ${windowLabel}`}
                value={availability == null ? '—' : `${(availability * 100).toFixed(2)}%`}
              />
              <Readout
                label={`Drops, ${windowLabel}`}
                value={drops.data ? String(recent.length) : '—'}
                color={recent.length ? fp.offline : undefined}
                hint={recent.length ? `longest ${duration(longest)}` : 'none'}
              />
            </Box>
          </Section>

          <Section title="Location" note={state ?? 'Offshore'} flush>
            <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
              <DeviceMap device={d} />
            </Box>
            <Box sx={{ px: 2.5, py: 1.75 }}>
              <Rows
                rows={[
                  ['Site', d.site],
                  ['State', state ?? 'At sea / outside state lines'],
                  ['Coordinates', `${d.lat.toFixed(4)}°N, ${d.lon.toFixed(4)}°E`],
                  ['Movement', d.kind === 'mobile' ? 'Roaming terminal' : 'Fixed site'],
                ]}
              />
            </Box>
          </Section>

          {weather && (
            <Section title="Weather" note="Simulated for the demo. No weather service is connected.">
              <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2, mb: 1.5 }}>
                <Box>
                  <Typography sx={{ fontWeight: 600, fontSize: 28, lineHeight: 1.1 }}>{weather.tempC}°C</Typography>
                  <Typography sx={{ fontSize: 14 }}>{weather.condition}</Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Label>Rain fade risk</Label>
                  <Box sx={{ mt: 0.5 }}>
                    <Pill color={fadeColor[weather.rainFade]}>{weather.rainFade}</Pill>
                  </Box>
                </Box>
              </Box>
              <Rows
                rows={[
                  ['Feels like', `${weather.feelsC}°C`],
                  ['Humidity', `${weather.humidity}%`],
                  ['Wind', `${weather.windKmh} km/h ${weather.windDir}`],
                  ['Cloud cover', `${weather.cloud}%`],
                  ['Rain', weather.rainMm ? `${weather.rainMm} mm/h` : 'None'],
                ]}
              />
              <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1.5 }}>
                Heavy rain absorbs Ku-band satellite signal, so RF dips during storms even when the dish is fine.
              </Typography>
            </Section>
          )}

          <Section title="Link">
            <Rows
              rows={[
                ['Customer', customer ?? '—'],
                ['Type', d.kind[0].toUpperCase() + d.kind.slice(1)],
                ['Satellite', `${d.satellite}, ${d.beam} beam`],
                ['RF threshold', `${d.rfThreshold} dB`],
                ['Backup SIM', d.sim ? `${d.sim.carrier}, ${d.sim.planGb} GB/mo` : 'None (fixed dish)'],
                ...(d.sim ? ([['ICCID', d.sim.iccid]] as [string, ReactNode][]) : []),
              ]}
            />
          </Section>
        </Stack>

        <Stack spacing={2.75} sx={{ minWidth: 0, order: { lg: 1 } }}>
          <SubHeader
            title="History"
            note="5-minute averages"
            action={<HoursToggle value={hours} onChange={setHours} />}
          />

          <KpiStrip
            compact
            items={[
              {
                label: `Uptime, ${windowLabel}`,
                value: availability == null ? '—' : `${(availability * 100).toFixed(2)}%`,
                color: availability != null && availability < TARGET ? fp.degraded : fp.online,
                hint: `target ${TARGET * 100}%`,
              },
              {
                label: 'Downtime',
                value: drops.data ? duration(downSec) : '—',
                color: downSec ? fp.offline : undefined,
                hint: drops.data ? `${recent.length} drops` : undefined,
              },
              {
                label: openDrop ? 'Down since' : 'Online since',
                value: openDrop ? ago(openDrop.start) : lastEnd ? ago(lastEnd) : `>${windowLabel}`,
                color: openDrop ? fp.offline : undefined,
                hint: openDrop ? dateTime(openDrop.start) : lastEnd ? dateTime(lastEnd) : 'no drops in window',
              },
              {
                label: 'RF signal, avg',
                value: rf ? `${rf.avg.toFixed(1)} dB` : '—',
                color: rf && rf.avg < d.rfThreshold ? fp.degraded : undefined,
                hint: rf ? `min ${rf.min.toFixed(1)}, max ${rf.max.toFixed(1)}` : undefined,
              },
              {
                label: 'Bandwidth, avg',
                value: bw ? `${bw.avg.toFixed(1)} Mbps` : '—',
                hint: bw ? `min ${bw.min.toFixed(1)}, max ${bw.max.toFixed(1)}` : undefined,
              },
            ]}
          />

          <Section
            title="Availability"
            note={`Share of time online per ${hours <= 6 ? '30 minutes' : hours <= 24 ? 'hour' : hours <= 168 ? '6 hours' : 'day'}, target ${TARGET * 100}% dashed`}
          >
            {bars.length === 0 ? (
              empty
            ) : (
              <BarChart
                height={200}
                hideLegend
                grid={{ horizontal: true }}
                margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
                xAxis={[
                  {
                    data: bars.map((b) => b.at),
                    scaleType: 'band',
                    valueFormatter: (v: Date, ctx) =>
                      hours > 168
                        ? v.toLocaleDateString([], { day: 'numeric', month: 'short' })
                        : hours > 24
                        ? v.toLocaleString([], { weekday: 'short', hour: '2-digit' })
                        : ctx.location === 'tick'
                          ? v.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : v.toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            }),
                    tickLabelInterval: (_v: Date, i: number) => i % Math.ceil(bars.length / 8) === 0,
                  },
                ]}
                yAxis={[
                  {
                    min: Math.max(0, Math.floor(Math.min(...bars.map((b) => b.pct)) / 10) * 10 - 10),
                    max: 100,
                    width: 48,
                    valueFormatter: (v: number) => `${v}%`,
                    // One hue, on the hours that missed the target; the rest stay neutral.
                    colorMap: { type: 'piecewise', thresholds: [TARGET * 100], colors: [fp.offline, fp.muted] },
                  },
                ]}
                series={[
                  {
                    data: bars.map((b) => Math.round(b.pct * 100) / 100),
                    label: 'Availability',
                    valueFormatter: (v) => `${v}%`,
                  },
                ]}
                sx={{
                  '& .MuiChartsAxis-line, & .MuiChartsAxis-tick': { display: 'none' },
                  '& .MuiChartsAxis-tickLabel': { fill: `${fp.muted} !important`, fontSize: '11px !important' },
                  '& .MuiChartsGrid-line': { stroke: fp.rule, strokeDasharray: '4 4' },
                }}
              >
                <ChartsReferenceLine y={TARGET * 100} lineStyle={{ stroke: fp.muted, strokeDasharray: '5 4' }} />
              </BarChart>
            )}
          </Section>

          <Section title="Offline time" note="Minutes the link was down in each 5-minute window">
            {chart.length === 0 ? (
              empty
            ) : (
              <TrendChart
                x={x}
                data={chart.map((b) => round1((1 - b.availability) * 5))}
                color={fp.offline}
                label="Minutes down"
                hours={hours}
                yMin={0}
                height={180}
              />
            )}
          </Section>

          <Box sx={{ display: 'grid', gap: 2.75, gridTemplateColumns: { xs: '1fr', xl: '1fr 1fr' } }}>
            <Section title="RF signal" note={`dB, with the ${d.rfThreshold} dB threshold dashed`}>
              {chart.length === 0 ? (
                empty
              ) : (
                <TrendChart
                  x={x}
                  data={chart.map((b) => round1(b.avgRfSignal))}
                  color={fp.accent}
                  label="RF (dB)"
                  hours={hours}
                  yMin={0}
                >
                  {/* Below this the link is degraded even while it reports online. */}
                  <ChartsReferenceLine
                    y={d.rfThreshold}
                    lineStyle={{ stroke: fp.degraded, strokeDasharray: '5 4', strokeWidth: 1.5 }}
                  />
                </TrendChart>
              )}
            </Section>
            <Section title="Bandwidth" note="Mbps">
              {chart.length === 0 ? (
                empty
              ) : (
                <TrendChart
                  x={x}
                  data={chart.map((b) => round1(b.avgBandwidth))}
                  color={fp.accent}
                  label="Mbps"
                  hours={hours}
                  yMin={0}
                />
              )}
            </Section>
          </Box>

          <Section title="Recent disconnections" note={`Last ${windowLabel}, newest first`} flush>
            {recent.length === 0 ? (
              <Typography sx={{ px: 2.5, py: 3, color: 'text.secondary', borderTop: 1, borderColor: 'divider' }}>
                {drops.data ? `No disconnections in the last ${windowLabel}.` : 'Loading…'}
              </Typography>
            ) : (
              <Box
                component="table"
                sx={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 13,
                  '& th, & td': { textAlign: 'left', px: 2.5, py: 1.25, borderTop: 1, borderColor: 'divider' },
                  '& th': { fontSize: 12, color: 'text.secondary', fontWeight: 400 },
                }}
              >
                <thead>
                  <tr>
                    <th>Started</th>
                    <th>Ended</th>
                    <th style={{ textAlign: 'right' }}>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.slice(0, 12).map((e) => (
                    <tr key={e.start}>
                      <td>{dateTime(e.start)}</td>
                      <td>{e.end ? dateTime(e.end) : <Pill color={fp.offline}>still down</Pill>}</td>
                      <td style={{ textAlign: 'right' }}>{duration(e.durationSec)}</td>
                    </tr>
                  ))}
                </tbody>
              </Box>
            )}
          </Section>
        </Stack>
      </Box>
    </Stack>
  )
}

function Back() {
  return (
    <Link
      href="#/"
      underline="hover"
      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, width: 'fit-content', fontSize: 14, fontWeight: 600 }}
    >
      <Icon d={ICONS.back} size={16} /> Back to dashboard
    </Link>
  )
}
