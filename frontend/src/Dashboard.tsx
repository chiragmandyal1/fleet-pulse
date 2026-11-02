import { Alert, Box, Button, Stack, Typography, useMediaQuery, useTheme } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { phoneColumns } from './phoneGrid.tsx'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import { useCallback, useMemo, useState } from 'react'
import { api, type Customer, type Device, type Disconnection, type LinkStatus, type Summary, type User } from './api.ts'
import { CustomerHealth, RegionRanking } from './Breakdowns.tsx'
import { DeviceLink, HealthHero, HoursToggle, KpiStrip, SearchBox, Section, StatusChip, TrendChart } from './common.tsx'
import FleetMap from './FleetMap.tsx'
import { ago, downsample, duration, openRow, usePolling, WINDOWS } from './lib.ts'
import { HEADING } from './theme.ts'

/** Problems first: an operator scans the top of the table, not the bottom. */
const STATUS_ORDER: Record<LinkStatus, number> = { offline: 0, unknown: 1, online: 2 }

const round1 = (v: number) => Math.round(v * 10) / 10

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/** One row of the down-now panel: the device, a grey subline, and one figure on the right. */
function DropRow({
  drop,
  sub,
  figure,
  alert,
  muted,
}: {
  drop: Disconnection
  sub: string
  figure: string
  alert?: boolean
  muted?: boolean
}) {
  const { fp } = useTheme().palette
  return (
    <Box
      component="a"
      href={`#/devices/${drop.deviceId}`}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2.5,
        minHeight: 46,
        color: 'text.primary',
        textDecoration: 'none',
        borderTop: 1,
        borderColor: 'divider',
        '&:hover': { bgcolor: alpha(fp.text, 0.03) },
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: 8,
          height: 8,
          flex: 'none',
          borderRadius: '50%',
          bgcolor: muted ? fp.online : fp.offline,
          boxShadow: `0 0 10px ${alpha(muted ? fp.online : fp.offline, 0.7)}`,
        }}
      />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography noWrap sx={{ fontWeight: 500, fontSize: 13, color: muted ? 'text.secondary' : 'text.primary' }}>
          {drop.name ?? drop.deviceId}
        </Typography>
        <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary' }}>
          {drop.deviceId}, {sub}
        </Typography>
      </Box>
      <Typography
        sx={{
          fontFamily: HEADING,
          fontSize: 14,
          fontWeight: muted ? 500 : 600,
          color: alert ? fp.offline : muted ? 'text.secondary' : 'text.primary',
          flex: 'none',
        }}
      >
        {figure}
      </Typography>
    </Box>
  )
}

export default function Dashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const { fp } = useTheme().palette
  const [hours, setHours] = useState(24)
  const [search, setSearch] = useState('')

  const loadSummary = useCallback(() => api<Summary>(`/fleet/summary?hours=${hours}`), [hours])
  const loadDevices = useCallback(() => api<Device[]>('/devices'), [])
  const loadCustomers = useCallback(() => api<Customer[]>('/customers'), [])
  // 6h covers every outage still open (the longest run about 2.5h); older open ones would show as silent.
  const loadDrops = useCallback(() => api<Disconnection[]>('/disconnections?hours=6'), [])

  const summary = usePolling(loadSummary, onLogout)
  const devices = usePolling(loadDevices, onLogout)
  const customers = usePolling(loadCustomers, onLogout)
  const drops = usePolling(loadDrops, onLogout)

  const customerName = useMemo(() => new Map(customers.data?.map((c) => [c.customerId, c.name])), [customers.data])

  const columns = useMemo<GridColDef<Device>[]>(
    () => [
      {
        field: 'status',
        headerName: 'Status',
        width: 110,
        sortComparator: (a: LinkStatus, b: LinkStatus) => STATUS_ORDER[a] - STATUS_ORDER[b],
        renderCell: ({ value }) => <StatusChip status={value as LinkStatus} />,
      },
      { field: 'deviceId', headerName: 'Device', width: 110 },
      {
        field: 'name',
        headerName: 'Name',
        flex: 1,
        minWidth: 180,
        renderCell: ({ row, value }) => <DeviceLink id={row.deviceId}>{value}</DeviceLink>,
      },
      // A customer only ever sees its own devices; the column would be the same on every row.
      ...(user.role === 'customer'
        ? []
        : [
            {
              field: 'customerId',
              headerName: 'Customer',
              width: 190,
              valueGetter: (value: string) => customerName.get(value) ?? value,
            } satisfies GridColDef<Device>,
          ]),
      { field: 'kind', headerName: 'Type', width: 90 },
      {
        field: 'bandwidth',
        headerName: 'Mbps',
        type: 'number',
        width: 90,
        valueFormatter: (v: number | null) => (v == null ? '—' : v.toFixed(1)),
      },
      {
        field: 'rfSignal',
        headerName: 'RF (dB)',
        type: 'number',
        width: 100,
        // Below the device's own threshold the link is degraded even while online.
        renderCell: ({ value, row }) =>
          value == null ? (
            '—'
          ) : (
            <Box component="span" sx={{ color: value < row.rfThreshold ? 'warning.main' : undefined }}>
              {(value as number).toFixed(1)}
            </Box>
          ),
      },
      {
        field: 'lastSeen',
        headerName: 'Last seen',
        width: 110,
        valueFormatter: (v: string | null) => ago(v),
      },
    ],
    [user.role, customerName],
  )

  // A failed poll keeps the last good data; never show it under a different window's label.
  const s = summary.data?.hours === hours ? summary.data : undefined
  const total = s?.counts.total ?? 0
  const trend = s?.trend ?? []
  const chart = downsample(trend, 96)
  const x = chart.map((p) => new Date(p.bucket))
  const online = chart.map((p) => round1(p.onlineDevices))
  const offline = chart.map((p) => round1(Math.max(0, total - p.onlineDevices)))
  const windowLabel = WINDOWS.find((w) => w.hours === hours)?.label
  const error = summary.error ?? devices.error

  // The screen's question: which links are down right now? Longest outage first.
  const downNow = (drops.data ?? []).filter((d) => d.end === null).sort((a, b) => b.durationSec - a.durationSec)
  const longDown = downNow.filter((d) => d.durationSec >= 600).length
  // Fill the list to about eleven rows (the map's height) with the most recent recoveries.
  const backUp = (drops.data ?? [])
    .filter((d) => d.end !== null)
    .sort((a, b) => (a.end! < b.end! ? 1 : -1))
    .slice(0, Math.max(0, 11 - downNow.length))
  const finding = !s
    ? summary.error
      ? 'This time range could not be loaded.'
      : 'Loading the fleet…'
    : s.counts.offline === 0
      ? `All ${total} devices are reporting.`
      : `${s.counts.offline} of ${total} devices are down right now` +
        (longDown ? `, ${longDown} of them for more than 10 minutes.` : ', none for more than 10 minutes.')

  const chartBody = (series: number[], color: string, label: string, yMin?: number) =>
    trend.length === 0 ? (
      <Typography sx={{ py: 10, textAlign: 'center', color: 'text.secondary' }}>
        {s ? 'No telemetry in this window yet.' : 'Loading…'}
      </Typography>
    ) : (
      <TrendChart x={x} data={series} color={color} label={label} hours={hours} yMin={yMin} height={250} />
    )

  const grid = phoneColumns(
    columns,
    phone,
    ['status', 'name', 'lastSeen'],
    'name',
    (r) => `${r.deviceId}, ${customerName.get(r.customerId) ?? r.customerId}`,
  )

  return (
    <Stack spacing={3}>
      {error && <Alert severity="warning">Couldn't refresh ({error}). Showing the last data received.</Alert>}

      <HealthHero
        availability={s?.availability}
        online={s?.counts.online}
        unknown={s?.counts.unknown}
        offline={s?.counts.offline}
        finding={finding}
        windowLabel={windowLabel}
        action={<HoursToggle value={hours} onChange={setHours} />}
      />

      <KpiStrip
        items={[
          {
            label: 'Offline now',
            value: s?.counts.offline ?? '—',
            color: fp.offline,
            lead: true,
            hint: 'links down',
            spark: offline.slice(-48),
          },
          {
            label: 'Longest outage open',
            value: downNow.length ? duration(downNow[0].durationSec) : '—',
            color: longDown ? fp.degraded : undefined,
            hint: downNow.length ? downNow[0].name ?? downNow[0].deviceId : 'nothing is down',
          },
          { label: 'Devices', value: total || '—', hint: `${s?.counts.online ?? "—"} reporting` },
          {
            label: 'Customers',
            value: customers.data?.length ?? '—',
            hint: user.role === 'customer' ? 'your company' : 'sharing this fleet',
          },
        ]}
      />

      {/* The signature: where the outages are, and the list of them beside it. */}
      <Box
        sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 2fr) minmax(320px, 1fr)' } }}
      >
        <Section title="Where" note="Every device; red ones are down, drawn larger and on top" flush>
          <Box
            sx={{
              borderTop: 1,
              borderColor: 'divider',
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 12,
              overflow: 'hidden',
            }}
          >
            <FleetMap devices={devices.data ?? []} height={560} />
          </Box>
        </Section>
        <Section
          title="Down now"
          note="Longest outage first"
          action={
            <Button href="#/disconnections" variant="text">
              All drops
            </Button>
          }
          flush
        >
          <Box sx={{ maxHeight: 560, overflowY: 'auto', overscrollBehavior: 'contain' }}>
            {downNow.length === 0 && (
              <Typography sx={{ px: 2.5, py: 2, color: 'text.secondary', borderTop: 1, borderColor: 'divider' }}>
                {drops.data ? 'Nothing is down right now.' : 'Loading…'}
              </Typography>
            )}
            {downNow.map((d) => (
              <DropRow
                key={`${d.deviceId}-${d.start}`}
                drop={d}
                sub={`down since ${clock(d.start)}`}
                figure={duration(d.durationSec)}
                alert={d.durationSec >= 600}
              />
            ))}
            {/* Reference data under a short list, so the panel never holds a blank band. */}
            {backUp.length > 0 && (
              <>
                <Typography
                  sx={{
                    px: 2.5,
                    pt: 2,
                    pb: 1,
                    fontSize: 12,
                    color: 'text.secondary',
                    borderTop: 1,
                    borderColor: 'divider',
                  }}
                >
                  Back up recently
                </Typography>
                {backUp.map((d) => (
                  <DropRow
                    key={`${d.deviceId}-${d.start}`}
                    drop={d}
                    sub={`back at ${clock(d.end!)}`}
                    figure={`down ${duration(d.durationSec)}`}
                    muted
                  />
                ))}
              </>
            )}
          </Box>
        </Section>
      </Box>

      <CustomerHealth devices={devices.data ?? []} customers={customers.data ?? []} />

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, minmax(0, 1fr))' } }}>
        <RegionRanking devices={devices.data ?? []} />
        <Section title="Offline devices" note="5-minute averages">
          {chartBody(offline, fp.offline, 'Offline', 0)}
        </Section>
        <Section title="Online devices" note={`5-minute averages, out of ${total || '—'}`}>
          {chartBody(online, fp.accent, 'Online', online.length ? Math.floor(Math.min(...online) - 2) : undefined)}
        </Section>
      </Box>

      <Section
        title="Devices"
        note="Problems first. Select a row to open the device."
        action={<SearchBox value={search} onChange={setSearch} placeholder="Search devices…" />}
        flush
      >
        <Box sx={{ height: 600 }}>
          <DataGrid
            rows={devices.data ?? []}
            columns={grid.columns}
            columnVisibilityModel={grid.visibility}
            {...(grid.rowHeight && { rowHeight: grid.rowHeight })}
            getRowId={(d) => d.deviceId}
            loading={!devices.data}
            disableRowSelectionOnClick
            filterModel={{ items: [], quickFilterValues: search.split(/\s+/).filter(Boolean) }}
            onRowClick={openRow}
            initialState={{
              sorting: { sortModel: [{ field: 'status', sort: 'asc' }] },
              pagination: { paginationModel: { pageSize: 25 } },
            }}
            pageSizeOptions={[25, 50, 100]}
            sx={{
              '& .MuiDataGrid-row': { cursor: 'pointer' },
            }}
          />
        </Box>
      </Section>
    </Stack>
  )
}
