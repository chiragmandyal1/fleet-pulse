import { Alert, Box, Button, Stack, TextField, Typography, useTheme } from '@mui/material'
import { Panel } from './common.tsx'
import { alpha } from '@mui/material/styles'
import { HEADING } from './theme.ts'
import { useState, type FormEvent } from 'react'
import { login, UnauthorizedError, type User } from './api.ts'

/** Seeded by the API on first start; shown here because this is a public demo. */
const DEMO = [
  { label: 'Admin', email: 'admin@fleetpulse.dev', note: 'all customers, can edit' },
  { label: 'Viewer', email: 'viewer@fleetpulse.dev', note: 'all customers, read-only' },
  { label: 'Customer', email: 'northwind@fleetpulse.dev', note: 'one company only' },
]

export default function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const { fp } = useTheme().palette
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      onLogin(await login(email, password))
    } catch (err) {
      setError(
        err instanceof UnauthorizedError ? 'That email and password don’t match an account.' : (err as Error).message,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        p: 2,
        bgcolor: 'background.default',
        backgroundImage: `radial-gradient(900px 420px at 50% -5%, ${alpha(fp.accent, 0.16)}, transparent 65%), radial-gradient(600px 300px at 90% 100%, ${alpha(fp.amber, 0.07)}, transparent 70%)`,
      }}
    >
      <Box sx={{ width: '100%', maxWidth: 440 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, justifyContent: 'center', mb: 1.5 }}>
          <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
            <path
              d="M3 17h6l3-8 5 15 3-7h9"
              fill="none"
              stroke={fp.amber}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ filter: `drop-shadow(0 0 6px ${alpha(fp.amber, 0.7)})` }}
            />
          </svg>
          <Typography sx={{ fontFamily: HEADING, fontWeight: 600, fontSize: '1.4rem', letterSpacing: '-0.01em' }}>
            Fleet Pulse
          </Typography>
        </Box>
        <Typography
          component="p"
          sx={{
            fontFamily: HEADING,
            fontWeight: 600,
            fontSize: { xs: 26, sm: 32 },
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            textAlign: 'center',
            textWrap: 'balance',
            mb: 3,
          }}
        >
          Every link in your fleet, in one pulse.
        </Typography>
        <Panel sx={{ p: { xs: 3, sm: 4 } }}>
          <Typography variant="h5" component="h1">
            Sign in
          </Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mb: 3 }}>
            Monitor satellite and cellular links across your fleet.
          </Typography>
          <Stack component="form" spacing={2} onSubmit={submit}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Email"
              name="email"
              type="email"
              slotProps={{ htmlInput: { spellCheck: false } }}
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <TextField
              label="Password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" variant="contained" size="large" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </Stack>
        </Panel>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 3, mb: 1, textAlign: 'center' }}>
          Or try a demo account (password fleetpulse)
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
          {DEMO.map((d) => (
            <Button
              key={d.email}
              variant="outlined"
              color="inherit"
              onClick={() => {
                setEmail(d.email)
                setPassword('fleetpulse')
              }}
              sx={{
                flexDirection: 'column',
                borderRadius: '12px',
                py: 1.25,
                borderColor: 'divider',
                bgcolor: 'background.paper',
                lineHeight: 1.3,
                '&:hover': { borderColor: fp.accent, bgcolor: alpha(fp.accent, 0.08) },
              }}
            >
              {d.label}
              <Typography component="span" variant="caption" color="text.secondary" sx={{ fontWeight: 400 }}>
                {d.note}
              </Typography>
            </Button>
          ))}
        </Box>
      </Box>
    </Box>
  )
}
