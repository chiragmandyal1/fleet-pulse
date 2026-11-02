import DownloadOutlined from '@mui/icons-material/DownloadOutlined'
import { Box, Button, Stack, Typography, useTheme } from '@mui/material'
import { useEffect, useState } from 'react'
import { api, type Customer, type Device, type Disconnection } from './api.ts'
import { DeviceLink, HoursToggle, Intro, Panel, Section } from './common.tsx'
import { dateTime, downloadFile, toCsv } from './lib.ts'

type AvailabilityRow = Device & {
  availability: number | null
  downtimeMin: number | null
  avgBandwidth: number | null
  avgRfSignal: number | null
}

const pct = (v: number | null) => (v == null ? '' : (v * 100).toFixed(2))
const fixed = (v: number | null, digits = 1) => (v == null ? '' : v.toFixed(digits))

async function customerNames() {
  return new Map((await api<Customer[]>('/customers')).map((c) => [c.customerId, c.name]))
}

const REPORTS: {
  id: string
  title: string
  note: string
  windows?: { hours: number; label: string }[]
  build: (hours: number) => Promise<string>
}[] = [
  {
    id: 'availability',
    title: 'Availability by device',
    note: 'Uptime percentage, downtime minutes and average bandwidth and signal for every device over the period.',
    windows: [
      { hours: 24, label: '24h' },
      { hours: 168, label: '7d' },
      { hours: 720, label: '30d' },
    ],
    build: async (hours) => {
      const [rows, names] = await Promise.all([
        api<AvailabilityRow[]>(`/reports/availability?hours=${hours}`),
        customerNames(),
      ])
      return toCsv(rows, [
        ['Device', (r) => r.deviceId],
        ['Name', (r) => r.name],
        ['Customer', (r) => names.get(r.customerId) ?? r.customerId],
        ['Satellite', (r) => r.satellite],
        ['Beam', (r) => r.beam],
        ['Availability %', (r) => pct(r.availability)],
        ['Downtime (min)', (r) => fixed(r.downtimeMin)],
        ['Avg bandwidth (Mbps)', (r) => fixed(r.avgBandwidth)],
        ['Avg RF (dB)', (r) => fixed(r.avgRfSignal)],
      ])
    },
  },
  {
    id: 'disconnections',
    title: 'Disconnections',
    note: 'Every outage with when it started, when it ended and how long it lasted.',
    windows: [
      { hours: 24, label: '24h' },
      { hours: 168, label: '7d' },
      { hours: 720, label: '30d' },
    ],
    build: async (hours) => {
      const [rows, names] = await Promise.all([api<Disconnection[]>(`/disconnections?hours=${hours}`), customerNames()])
      return toCsv(rows, [
        ['Device', (r) => r.deviceId],
        ['Name', (r) => r.name],
        ['Customer', (r) => (r.customerId ? (names.get(r.customerId) ?? r.customerId) : '')],
        ['Started (UTC)', (r) => r.start],
        ['Ended (UTC)', (r) => r.end ?? 'ongoing'],
        ['Duration (s)', (r) => r.durationSec],
      ])
    },
  },
  {
    id: 'inventory',
    title: 'Device inventory',
    note: 'Every device with its type, site, coordinates, satellite, beam, RF threshold and SIM.',
    build: async () => {
      const [rows, names] = await Promise.all([api<Device[]>('/devices'), customerNames()])
      return toCsv(rows, [
        ['Device', (r) => r.deviceId],
        ['Name', (r) => r.name],
        ['Customer', (r) => names.get(r.customerId) ?? r.customerId],
        ['Type', (r) => r.kind],
        ['Site', (r) => r.site],
        ['Latitude', (r) => r.lat],
        ['Longitude', (r) => r.lon],
        ['Satellite', (r) => r.satellite],
        ['Beam', (r) => r.beam],
        ['RF threshold (dB)', (r) => r.rfThreshold],
        ['SIM ICCID', (r) => r.sim?.iccid],
        ['SIM carrier', (r) => r.sim?.carrier],
        ['Status now', (r) => r.status],
      ])
    },
  },
]

function ReportRow({ report }: { report: (typeof REPORTS)[number] }) {
  const [hours, setHours] = useState(report.windows?.[0].hours ?? 0)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string }>()

  async function download() {
    setBusy(true)
    setResult(undefined)
    try {
      const label = report.windows?.find((w) => w.hours === hours)?.label
      const filename = `fleet-pulse-${report.id}${label ? `-${label}` : ''}-${new Date().toISOString().slice(0, 10)}.csv`
      downloadFile(filename, await report.build(hours))
      setResult({ ok: true, text: `Downloaded ${filename} at ${dateTime(new Date().toISOString())}` })
    } catch (err) {
      setResult({ ok: false, text: `Download failed: ${(err as Error).message}. Try again.` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 2,
        alignItems: 'center',
        flexWrap: 'wrap',
        p: 2.5,
        borderBottom: 1,
        borderColor: 'divider',
        '&:last-of-type': { borderBottom: 0 },
      }}
    >
      <Box sx={{ flex: '1 1 320px' }}>
        <Typography variant="h6">{report.title}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '70ch' }}>
          {report.note}
        </Typography>
        {result && (
          <Typography role="status" variant="body2" sx={{ mt: 0.5, color: result.ok ? 'success.main' : 'error.main' }}>
            {result.text}
          </Typography>
        )}
      </Box>
      {report.windows && <HoursToggle value={hours} onChange={setHours} options={report.windows} />}
      <Button
        variant="outlined"
        startIcon={<DownloadOutlined />}
        onClick={download}
        disabled={busy}
        sx={{ minWidth: 160 }}
      >
        {busy ? 'Preparing…' : 'Download CSV'}
      </Button>
    </Box>
  )
}

/** The first rows of the availability report, worst first: what the download holds, before downloading it. */
function Preview() {
  const { fp } = useTheme().palette
  const [rows, setRows] = useState<AvailabilityRow[]>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    api<AvailabilityRow[]>('/reports/availability?hours=24').then(
      (all) =>
        setRows(
          all
            .filter((r) => r.availability != null)
            .sort((a, b) => a.availability! - b.availability!)
            .slice(0, 5),
        ),
      (err) => setError((err as Error).message),
    )
  }, [])
  return (
    <Section
      title="Availability by device, preview"
      note="The 5 least available devices in the last 24h. The CSV has all of them."
      flush
    >
      {error ? (
        <Typography sx={{ px: 2.5, py: 2, color: 'text.secondary' }}>Couldn't load the preview: {error}.</Typography>
      ) : !rows ? (
        <Typography sx={{ px: 2.5, py: 2, color: 'text.secondary' }}>Loading…</Typography>
      ) : (
        <Box
          component="table"
          sx={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 13,
            '& th, & td': { px: 2.5, py: 1.1, borderTop: 1, borderColor: 'divider', textAlign: 'left' },
            '& th': { fontSize: 12, fontWeight: 400, color: 'text.secondary' },
            '& .num': { textAlign: 'right' },
          }}
        >
          <thead>
            <tr>
              <th>Device</th>
              <th className="num">Available</th>
              <th className="num">Down</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.deviceId}>
                <td>
                  <DeviceLink id={r.deviceId}>{r.name}</DeviceLink>
                  <Box sx={{ fontSize: 12, color: 'text.secondary' }}>{r.deviceId}</Box>
                </td>
                <td className="num" style={{ color: r.availability! < 0.95 ? fp.offline : undefined }}>
                  {(r.availability! * 100).toFixed(2)}%
                </td>
                <td className="num">{Math.round(r.downtimeMin ?? 0)} min</td>
              </tr>
            ))}
          </tbody>
        </Box>
      )}
    </Section>
  )
}

export default function ReportsPage() {
  return (
    <Stack spacing={3}>
      <Intro>
        Each report covers only the devices your account can see. Times are in UTC so they line up across teams.
      </Intro>
      <Box
        sx={{
          display: 'grid',
          gap: 3,
          alignItems: 'start',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.2fr) minmax(0, 1fr)' },
        }}
      >
        <Panel>
          {REPORTS.map((r) => (
            <ReportRow key={r.id} report={r} />
          ))}
        </Panel>
        <Preview />
      </Box>
    </Stack>
  )
}
