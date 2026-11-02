import { Box } from '@mui/material'
import type { GridColDef, GridColumnVisibilityModel, GridValidRowModel } from '@mui/x-data-grid'

/**
 * Tables become lists of two-line rows on a phone: only `keep` stays visible, the
 * identity column (the first flexible one kept) takes the spare width and shows
 * `sub` as a grey second line, so fields move under the name instead of off-screen.
 */
export function phoneColumns<R extends GridValidRowModel>(
  columns: GridColDef<R>[],
  phone: boolean,
  keep: string[],
  identity: string,
  sub: (row: R) => string,
): { columns: GridColDef<R>[]; visibility?: GridColumnVisibilityModel; rowHeight?: number } {
  if (!phone) return { columns }
  return {
    rowHeight: 58,
    visibility: Object.fromEntries(columns.filter((c) => !keep.includes(c.field)).map((c) => [c.field, false])),
    columns: columns.map((c) =>
      c.field === identity
        ? {
            ...c,
            disableColumnMenu: true,
            flex: 1,
            minWidth: 0,
            renderCell: ({ row, value }) => (
              <Box sx={{ minWidth: 0, lineHeight: 1.35, py: 0.5 }}>
                <Box sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.renderCell ? c.renderCell({ row, value } as never) : value}
                </Box>
                <Box
                  sx={{
                    fontSize: 12,
                    color: 'text.secondary',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {sub(row)}
                </Box>
              </Box>
            ),
          }
        : keep.includes(c.field)
          ? // No column menu on a phone: its icon cost the header its words ("St…", "Last s…").
            { ...c, disableColumnMenu: true, flex: undefined, width: Math.min(c.width ?? 104, 104), minWidth: 0 }
          : c,
    ),
  }
}
