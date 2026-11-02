import { Avatar, Box, Button, CardContent, Stack, Typography, useTheme } from '@mui/material'
import { Panel, Section } from './common.tsx'
import { useCallback, useMemo } from 'react'
import { api, session, type Customer, type User, type Summary } from './api.ts'
import { initials, tokenExpiry, usePolling } from './lib.ts'

function access(user: User, customer?: string): string {
  if (user.role === 'admin')
    return "You can see every customer's devices and change device settings, such as a dish's RF threshold."
  if (user.role === 'viewer') return "You can see every customer's devices. You can't change any settings."
  return `You can see ${customer ?? 'your company'}'s devices only. You can't change any settings.`
}

export default function ProfilePage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { fp } = useTheme().palette
  const loadCustomers = useCallback(() => api<Customer[]>('/customers'), [])
  const customers = usePolling(loadCustomers, onLogout)
  const loadSummary = useCallback(() => api<Summary>('/fleet/summary?hours=6'), [])
  const summary = usePolling(loadSummary, onLogout)
  const customer = customers.data?.find((c) => c.customerId === user.customerId)?.name
  const expires = useMemo(() => tokenExpiry(session.get()?.token), [])

  const rows: [string, string][] = [
    ['Email', user.email],
    ['Role', user.role],
    ...(user.role === 'customer' ? ([['Company', customer ?? user.customerId ?? '—']] as [string, string][]) : []),
    [
      'Session',
      expires
        ? `Signed in until ${expires.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}. Sign in again after that.`
        : 'Signed in.',
    ],
  ]

  const scope = summary.data
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 3,
        alignItems: 'start',
        gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) minmax(0, 1fr)' },
      }}
    >
      <Stack spacing={3}>
        <Panel>
          <CardContent sx={{ display: 'flex', gap: 2.5, alignItems: 'center', flexWrap: 'wrap', p: 3 }}>
            <Avatar
              sx={{
                width: 56,
                height: 56,
                bgcolor: 'transparent',
                border: 1,
                borderColor: fp.control,
                color: 'text.primary',
                fontWeight: 600,
                fontSize: '1.25rem',
              }}
            >
              {initials(user.email)}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 20, fontWeight: 600, wordBreak: 'break-all' }}>{user.email}</Typography>
              <Typography sx={{ fontSize: 13, color: 'text.secondary', textTransform: 'capitalize' }}>
                {user.role}
                {customer ? `, ${customer}` : ''}
              </Typography>
            </Box>
          </CardContent>
        </Panel>

        <Section title="Account">
          <Box
            component="dl"
            sx={{
              m: 0,
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '120px 1fr' },
              rowGap: 1.25,
              columnGap: 2,
            }}
          >
            {rows.map(([k, v]) => (
              <Box key={k} sx={{ display: 'contents' }}>
                <Typography component="dt" sx={{ fontSize: 13, color: 'text.secondary' }}>
                  {k}
                </Typography>
                <Typography
                  component="dd"
                  sx={{ m: 0, fontSize: 13, textTransform: k === 'Role' ? 'capitalize' : undefined }}
                >
                  {v}
                </Typography>
              </Box>
            ))}
          </Box>
          <Button variant="outlined" onClick={onLogout} sx={{ mt: 3 }}>
            Sign out
          </Button>
        </Section>
      </Stack>

      <Stack spacing={3}>
        <Section title="What you can do">
          <Typography sx={{ fontSize: 13, maxWidth: '65ch' }}>{access(user, customer)}</Typography>
        </Section>
        <Section title="What you can see" note="Right now, through this account">
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 2 }}>
            {(
              [
                ['Devices', scope?.counts.total],
                ['Down now', scope?.counts.offline],
                ['Customers', customers.data?.length],
              ] as [string, number | undefined][]
            ).map(([k, v]) => (
              <Box key={k}>
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{k}</Typography>
                <Typography
                  sx={{ fontSize: 20, fontWeight: 500, color: k === 'Down now' && v ? fp.offline : undefined }}
                >
                  {v ?? '—'}
                </Typography>
              </Box>
            ))}
          </Box>
        </Section>
      </Stack>
    </Box>
  )
}
