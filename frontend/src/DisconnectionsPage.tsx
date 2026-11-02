import { Box, Stack, Typography, useMediaQuery, useTheme } from '@mui/material'
import { phoneColumns } from './phoneGrid.tsx'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import { useCallback, useMemo, useState } from 'react'
import { api, type Customer, type Disconnection, type User } from './api.ts'
import { DeviceLink, HoursToggle, Intro, KpiStrip, Pill, SearchBox, Section } from './common.tsx'
import { dateTime, duration, openRow, usePolling } from './lib.ts'

export default function DisconnectionsPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [search, setSearch] = useState('')
  const { fp } = useTheme().palette
  const [hours, setHours] = useState(24)
  const loadEvents = useCallback(() => api<Disconnection[]>(`/disconnections?hours=${hours}`), [hours])
  const loadCustomers = useCallback(() => api<Customer[]>('/customers'), [])
  const { data, error } = usePolling(loadEvents, onLogout)
  const customers = usePolling(loadCustomers, onLogout)
  const names = useMemo(() => new Map(customers.data?.map((c) => [c.customerId, c.name])), [customers.data])

  const events = data ?? []
  const totalSec = events.reduce((n, e) => n + e.durationSec, 0)
  const longest = events.reduce((m, e) => Math.max(m, e.durationSec), 0)
  const ongoing = events.filter((e) => e.end === null).length
  const worstCount = new Set(events.map((e) => e.deviceId)).size

  const worst = useMemo(() => {
    const byDevice = new Map<string, { deviceId: string; name?: string; count: number; sec: number }>()
    for (const e of data ?? []) {
      const d = byDevice.get(e.deviceId) ?? { deviceId: e.deviceId, name: e.name, count: 0, sec: 0 }
      d.count++
      d.sec += e.durationSec
      byDevice.set(e.deviceId, d)
    }
    return [...byDevice.values()].sort((a, b) => b.count - a.count || b.sec - a.sec).slice(0, 5)
  }, [data])

  const columns: GridColDef<Disconnection>[] = [
    {
      field: 'name',
      headerName: 'Device',
      flex: 1,
      minWidth: 210,
      renderCell: ({ row, value }) => <DeviceLink id={row.deviceId}>{value}</DeviceLink>,
    },
    { field: 'deviceId', headerName: 'ID', width: 100 },
    { field: 'start', headerName: 'Started', width: 175, valueFormatter: (v: string) => dateTime(v) },
    {
      field: 'end',
      headerName: 'Ended',
      width: 175,
      renderCell: ({ value }) => (value ? dateTime(value as string) : <Pill color={fp.offline}>still down</Pill>),
    },
    {
      field: 'durationSec',
      headerName: 'Duration',
      type: 'number',
      width: 110,
      valueFormatter: (v: number) => duration(v),
    },
    ...(user.role === 'customer'
      ? []
      : [
          {
            field: 'customerId',
            headerName: 'Customer',
            width: 190,
            valueGetter: (v: string) => names.get(v) ?? v,
          } satisfies GridColDef<Disconnection>,
        ]),
  ]

  const grid = phoneColumns(
    columns,
    phone,
    ['name', 'durationSec'],
    'name',
    (r) => `${r.deviceId}, ${dateTime(r.start)}`,
  )

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Intro>A disconnection starts when a device stops reporting online and ends when it comes back.</Intro>
        <HoursToggle value={hours} onChange={setHours} />
      </Box>
      {error && <Typography color="error">Couldn't refresh: {error}. Showing the last data received.</Typography>}
      <KpiStrip
        items={[
          {
            label: 'Disconnections',
            value: data ? events.length.toLocaleString() : '—',
            hint: data ? `${worstCount} devices affected` : undefined,
          },
          { label: 'Still down', value: data ? ongoing : '—', color: ongoing ? fp.offline : undefined },
          { label: 'Total downtime', value: data ? duration(totalSec) : '—', hint: 'summed across devices' },
          { label: 'Longest', value: data ? duration(longest) : '—' },
        ]}
      />

      <Section title="Most affected devices" note="Most disconnections in the window. Select one to open it.">
        {worst.length === 0 ? (
          <Typography color="text.secondary">{data ? 'No disconnections in this window.' : 'Loading…'}</Typography>
        ) : (
          worst.map((d) => (
            <Box
              key={d.deviceId}
              component="a"
              href={`#/devices/${d.deviceId}`}
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'minmax(0, 1fr) auto auto', sm: '100px minmax(0, 1fr) auto auto' },
                alignItems: 'center',
                gap: 2,
                py: 1,
                color: 'text.primary',
                textDecoration: 'none',
                borderBottom: 1,
                borderColor: 'divider',
                '&:last-of-type': { borderBottom: 0 },
                '&:hover': { bgcolor: fp.surface },
              }}
            >
              <Box component="span" sx={{ display: { xs: 'none', sm: 'block' } }}>
                {d.deviceId}
              </Box>
              <Box component="span" sx={{ minWidth: 0 }}>
                <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</Box>
                <Box sx={{ display: { sm: 'none' }, fontSize: 12, color: 'text.secondary' }}>{d.deviceId}</Box>
              </Box>
              <span>{d.count} drops</span>
              <Box component="span" sx={{ color: 'text.secondary', minWidth: 70, textAlign: 'right' }}>
                {duration(d.sec)}
              </Box>
            </Box>
          ))
        )}
      </Section>

      <Section
        title="All disconnections"
        note="Newest first. Select a row to open the device."
        action={<SearchBox value={search} onChange={setSearch} placeholder="Search…" />}
        flush
      >
        <Box sx={{ height: 640 }}>
          <DataGrid
            rows={events}
            columns={grid.columns}
            columnVisibilityModel={grid.visibility}
            {...(grid.rowHeight && { rowHeight: grid.rowHeight })}
            getRowId={(e) => `${e.deviceId}-${e.start}`}
            loading={!data}
            filterModel={{ items: [], quickFilterValues: search.split(/\s+/).filter(Boolean) }}
            disableRowSelectionOnClick
            onRowClick={openRow}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            pageSizeOptions={[25, 50, 100]}
            sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }}
          />
        </Box>
      </Section>
    </Stack>
  )
}
