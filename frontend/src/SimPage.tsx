import { Box, Stack, Typography, useMediaQuery, useTheme } from '@mui/material'
import { phoneColumns } from './phoneGrid.tsx'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import { useCallback, useMemo, useState } from 'react'
import { api, type Device, type LinkStatus } from './api.ts'
import { DeviceLink, Intro, KpiStrip, SearchBox, Section, StatusChip } from './common.tsx'
import { openRow, usePolling } from './lib.ts'

type Row = Device & { sim: NonNullable<Device['sim']> }

export default function SimPage({ onLogout }: { onLogout: () => void }) {
  // Seven columns don't fit a tablet: two-line rows below desktop width.
  const phone = useMediaQuery(useTheme().breakpoints.down('md'))
  const [search, setSearch] = useState('')
  const load = useCallback(() => api<Device[]>('/devices'), [])
  const { data, error } = usePolling(load, onLogout)

  const rows = useMemo(() => (data ?? []).filter((d): d is Row => !!d.sim), [data])
  const carriers = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of rows) counts.set(r.sim.carrier, (counts.get(r.sim.carrier) ?? 0) + 1)
    return [...counts].sort((a, b) => b[1] - a[1])
  }, [rows])

  const columns: GridColDef<Row>[] = [
    {
      field: 'name',
      headerName: 'Name',
      flex: 1,
      minWidth: 190,
      renderCell: ({ row, value }) => <DeviceLink id={row.deviceId}>{value}</DeviceLink>,
    },
    { field: 'iccid', headerName: 'ICCID', width: 200, valueGetter: (_, row) => row.sim.iccid },
    { field: 'carrier', headerName: 'Carrier', width: 160, valueGetter: (_, row) => row.sim.carrier },
    {
      field: 'planGb',
      headerName: 'Plan',
      type: 'number',
      width: 100,
      valueGetter: (_, row) => row.sim.planGb,
      valueFormatter: (v: number) => `${v} GB/mo`,
    },
    { field: 'deviceId', headerName: 'Device', width: 105 },
    { field: 'kind', headerName: 'Type', width: 90 },
    {
      field: 'status',
      headerName: 'Device status',
      width: 125,
      renderCell: ({ value }) => <StatusChip status={value as LinkStatus} />,
    },
  ]

  const grid = phoneColumns(columns, phone, ['carrier', 'name', 'status'], 'name', (r) => r.sim.iccid)

  return (
    <Stack spacing={3}>
      <Intro>
        Backup SIMs in hybrid and mobile terminals, used when the satellite link drops. Fixed dishes have none.
      </Intro>
      {error && <Typography color="error">Couldn't refresh: {error}. Showing the last data received.</Typography>}
      <KpiStrip
        items={[
          {
            label: 'SIM cards',
            value: data ? rows.length : '—',
            hint: data ? `in ${rows.length} of ${data.length} terminals` : undefined,
          },
          ...carriers.map(([carrier, n]) => ({
            label: carrier,
            value: n,
            hint: `${Math.round((n / rows.length) * 100)}% of SIMs`,
          })),
        ]}
      />
      <Section
        title="All SIM cards"
        note="Search by ICCID, carrier or device."
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
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            pageSizeOptions={[25, 50, 100]}
            sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }}
          />
        </Box>
      </Section>
    </Stack>
  )
}
