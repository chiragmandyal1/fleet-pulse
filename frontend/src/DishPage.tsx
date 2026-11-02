import { Box, Stack, Typography, useMediaQuery, useTheme } from '@mui/material'
import { phoneColumns } from './phoneGrid.tsx'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import { useCallback, useMemo, useState } from 'react'
import { api, type Device } from './api.ts'
import { DeviceLink, Intro, KpiStrip, Pill, SearchBox, Section } from './common.tsx'
import { ago, openRow, usePolling } from './lib.ts'

type Health = 'healthy' | 'degraded' | 'no signal'
type Row = Device & { margin: number | null; health: Health }

/** Worst first: a degraded dish still reports, so it is the one most likely to be missed. */
const HEALTH_ORDER: Record<Health, number> = { degraded: 0, 'no signal': 1, healthy: 2 }

/** ±8 dB fills the bar; beyond that the exact figure is in the next column. */
const MARGIN_SPAN = 8

/** Signal margin as a bar growing left (below threshold) or right (above) from a centre line. */
function MarginBar({ margin }: { margin: number }) {
  const { fp } = useTheme().palette
  const pct = (Math.min(Math.abs(margin), MARGIN_SPAN) / MARGIN_SPAN) * 50
  return (
    <Box sx={{ position: 'relative', width: '100%', height: 8, bgcolor: fp.surface, borderRadius: 1 }} aria-hidden>
      <Box sx={{ position: 'absolute', left: '50%', top: -3, bottom: -3, width: '1px', bgcolor: fp.muted }} />
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          borderRadius: 1,
          bgcolor: margin < 0 ? fp.degraded : fp.online,
          ...(margin < 0 ? { right: '50%' } : { left: '50%' }),
          width: `${pct}%`,
        }}
      />
    </Box>
  )
}

export default function DishPage({ onLogout }: { onLogout: () => void }) {
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [search, setSearch] = useState('')
  const { fp } = useTheme().palette
  const healthColor: Record<Health, string> = { healthy: fp.online, degraded: fp.degraded, 'no signal': fp.muted }
  const load = useCallback(() => api<Device[]>('/devices'), [])
  const { data, error } = usePolling(load, onLogout)

  const rows = useMemo<Row[]>(
    () =>
      (data ?? []).map((d) => {
        const margin = d.status === 'online' && d.rfSignal != null ? d.rfSignal - d.rfThreshold : null
        return { ...d, margin, health: margin == null ? 'no signal' : margin < 0 ? 'degraded' : 'healthy' }
      }),
    [data],
  )
  const count = (h: Health) => rows.filter((r) => r.health === h).length

  const columns: GridColDef<Row>[] = [
    {
      field: 'health',
      headerName: 'Dish',
      width: 120,
      sortComparator: (a: Health, b: Health) => HEALTH_ORDER[a] - HEALTH_ORDER[b],
      renderCell: ({ value }) => <Pill color={healthColor[value as Health]}>{value}</Pill>,
    },
    { field: 'deviceId', headerName: 'Device', width: 105 },
    {
      field: 'name',
      headerName: 'Name',
      flex: 1,
      minWidth: 190,
      renderCell: ({ row, value }) => <DeviceLink id={row.deviceId}>{value}</DeviceLink>,
    },
    { field: 'kind', headerName: 'Type', width: 85 },
    {
      field: 'marginBar',
      headerName: 'Signal margin',
      width: 160,
      sortable: false,
      valueGetter: (_, row) => row.margin,
      renderCell: ({ row }) =>
        row.margin == null ? null : (
          <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <MarginBar margin={row.margin} />
          </Box>
        ),
    },
    {
      field: 'margin',
      headerName: 'dB',
      type: 'number',
      width: 80,
      // Dishes with no signal have no margin; keep them after the degraded ones either way.
      sortComparator: (a: number | null, b: number | null) =>
        a == null ? (b == null ? 0 : 1) : b == null ? -1 : a - b,
      renderCell: ({ value }) =>
        value == null ? (
          '—'
        ) : (
          <Box component="span" sx={{ color: value < 0 ? fp.degraded : undefined }}>
            {value > 0 ? '+' : ''}
            {(value as number).toFixed(1)}
          </Box>
        ),
    },
    {
      field: 'rfSignal',
      headerName: 'RF (dB)',
      type: 'number',
      width: 90,
      valueFormatter: (v: number | null) => (v == null ? '—' : v.toFixed(1)),
    },
    { field: 'rfThreshold', headerName: 'Threshold', type: 'number', width: 95 },
    { field: 'lastSeen', headerName: 'Last seen', width: 105, valueFormatter: (v: string | null) => ago(v) },
  ]

  const grid = phoneColumns(columns, phone, ['health', 'name', 'margin'], 'name', (r) => `${r.deviceId}, ${r.kind}`)

  return (
    <Stack spacing={3}>
      <Intro>
        Margin is a dish's RF signal minus its threshold. Below zero the link still reports online, so it never shows as
        a disconnection: check alignment, obstructions and weather.
      </Intro>
      {error && <Typography color="error">Couldn't refresh: {error}. Showing the last data received.</Typography>}
      <KpiStrip
        items={[
          {
            label: 'Healthy',
            value: data ? count('healthy') : '—',
            color: fp.online,
            hint: 'online, at or above threshold',
          },
          {
            label: 'Below threshold',
            value: data ? count('degraded') : '—',
            color: fp.degraded,
            hint: 'online but degraded',
          },
          { label: 'No signal', value: data ? count('no signal') : '—', hint: 'offline or not reporting' },
        ]}
      />
      <Section
        title="Dishes by signal margin"
        note="Lowest margin first. Select a row to open the device."
        action={<SearchBox value={search} onChange={setSearch} placeholder="Search…" />}
        flush
      >
        <Box sx={{ height: 640 }}>
          <DataGrid
            rows={rows}
            columns={grid.columns}
            columnVisibilityModel={grid.visibility}
            {...(grid.rowHeight && { rowHeight: grid.rowHeight })}
            getRowId={(r) => r.deviceId}
            loading={!data}
            filterModel={{ items: [], quickFilterValues: search.split(/\s+/).filter(Boolean) }}
            disableRowSelectionOnClick
            onRowClick={openRow}
            initialState={{
              sorting: { sortModel: [{ field: 'margin', sort: 'asc' }] },
              pagination: { paginationModel: { pageSize: 25 } },
            }}
            pageSizeOptions={[25, 50, 100]}
            sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }}
          />
        </Box>
      </Section>
    </Stack>
  )
}
