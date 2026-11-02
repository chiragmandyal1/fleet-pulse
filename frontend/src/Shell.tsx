import { Box, Divider, Menu, MenuItem, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useCallback, useState, type ReactNode } from 'react'
import { api, type Summary, type User } from './api.ts'
import { Icon } from './common.tsx'
import { ICONS } from './icons.ts'
import { initials, usePolling } from './lib.ts'
import DeviceSearch from './DeviceSearch.tsx'
import { useMode } from './mode.ts'
import { HEADING } from './theme.ts'

/** Icon rail width: the style's 50-60px band, so the screens get the width. */
const RAIL = 68
/** Room for labels: used from the lg breakpoint up. */
const SIDEBAR = 244

const NAV = [
  { path: '', label: 'Overview', short: 'Home', icon: ICONS.dashboard },
  { path: 'dish', label: 'Dish health', short: 'Dish', icon: ICONS.dish },
  { path: 'sims', label: 'SIM cards', short: 'SIM', icon: ICONS.sim },
  { path: 'satellites', label: 'Satellites', short: 'Beams', icon: ICONS.satellite },
  { path: 'reports', label: 'Reports', short: 'Reports', icon: ICONS.reports },
  { path: 'disconnections', label: 'Disconnections', short: 'Drops', icon: ICONS.unplug },
]

/** The brand mark: one beat of a pulse trace in the product's amber, on nothing. */
function Mark({ size = 24 }: { size?: number }) {
  const { fp } = useTheme().palette
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path
        d="M3 17h6l3-8 5 15 3-7h9"
        fill="none"
        stroke={fp.amber}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 5px ${alpha(fp.amber, 0.7)})` }}
      />
    </svg>
  )
}

/** A live badge: a breathing green dot and the word, so the page says it is being fed. */
function Live() {
  const { fp } = useTheme().palette
  return (
    <Box
      sx={{
        display: { xs: 'none', sm: 'inline-flex' },
        alignItems: 'center',
        gap: 0.75,
        height: 24,
        px: 1.25,
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.06em',
        color: fp.online,
        bgcolor: alpha(fp.online, 0.12),
        boxShadow: `inset 0 0 0 1px ${alpha(fp.online, 0.3)}`,
      }}
    >
      <Box
        component="span"
        sx={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          bgcolor: fp.online,
          boxShadow: `0 0 8px ${fp.online}`,
          animation: 'live-dot 1.6s ease-in-out infinite',
          '@keyframes live-dot': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.35 } },
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }}
      />
      LIVE
    </Box>
  )
}

/**
 * The live pulse: fleet availability across the last 6 hours, redrawn on every
 * poll. Scaled to its own min/max so a one-point dip is still visible.
 */
function Pulse({ summary }: { summary?: Summary }) {
  const { fp } = useTheme().palette
  const points = summary?.trend.map((b) => b.availability) ?? []
  const now = summary?.availability
  const w = 120
  const h = 24
  let path = ''
  let last: [number, number] | null = null
  if (points.length > 1) {
    const min = Math.min(...points)
    const span = Math.max(Math.max(...points) - min, 0.005)
    const xy = points.map((v, i): [number, number] => [
      (i / (points.length - 1)) * (w - 6) + 1,
      h - 3 - ((v - min) / span) * (h - 8),
    ])
    path = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('')
    last = xy[xy.length - 1]
  }
  const label =
    now == null ? 'Fleet availability loading' : `Fleet availability over the last 6 hours: ${(now * 100).toFixed(1)}%`

  return (
    <Tooltip title={label}>
      <Box role="img" aria-label={label} sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 1.25 }}>
        <svg width={w} height={h} style={{ overflow: 'visible' }}>
          <path d={path} fill="none" stroke={fp.amber} strokeWidth="1.5" strokeLinejoin="round" />
          {last && (
            <>
              <circle className="pulse-ring" cx={last[0]} cy={last[1]} r="3" fill={fp.amber} />
              <circle cx={last[0]} cy={last[1]} r="2.5" fill={fp.amber} />
            </>
          )}
        </svg>
        <Typography sx={{ fontSize: 13, fontWeight: 600, minWidth: '3.2em' }}>
          {now == null ? '—' : `${(now * 100).toFixed(1)}%`}
        </Typography>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', display: { xs: 'none', lg: 'block' } }}>
          available, 6h
        </Typography>
      </Box>
    </Tooltip>
  )
}

export default function Shell({
  user,
  onLogout,
  active,
  title,
  children,
}: {
  user: User
  onLogout: () => void
  /** NAV path of the current page; null when the page isn't in the nav. */
  active: string | null
  title: string
  children: ReactNode
}) {
  const theme = useTheme()
  const { fp } = theme.palette
  const { mode, toggle } = useMode()
  const desktop = useMediaQuery(theme.breakpoints.up('md'))
  const wide = useMediaQuery(theme.breakpoints.up('lg'))
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)

  const loadSummary = useCallback(() => api<Summary>('/fleet/summary?hours=6'), [])
  const { data: summary } = usePolling(loadSummary, onLogout)
  const offline = summary?.counts.offline ?? 0
  const themeLabel = mode === 'dark' ? 'Switch to day theme' : 'Switch to night theme'

  /** A count only on the queue that needs action, its noun given by the label. */
  const count = (path: string) =>
    path === 'disconnections' && offline > 0 ? (
      <Box
        component="span"
        aria-label={`${offline} devices offline now`}
        sx={{
          position: 'absolute',
          top: 2,
          right: 2,
          minWidth: 16,
          height: 16,
          px: '4px',
          borderRadius: 999,
          bgcolor: fp.offline,
          color: '#fff',
          fontSize: 11,
          fontWeight: 600,
          lineHeight: '16px',
          textAlign: 'center',
        }}
      >
        {offline}
      </Box>
    ) : null

  const iconButton = (label: string, onClick: () => void, d: string) => (
    <Tooltip title={label} placement={desktop ? 'right' : 'bottom'}>
      <Box
        component="button"
        type="button"
        onClick={onClick}
        aria-label={label}
        sx={{
          width: 40,
          height: 40,
          display: 'grid',
          placeItems: 'center',
          border: 0,
          bgcolor: 'transparent',
          color: 'text.secondary',
          cursor: 'pointer',
          borderRadius: '6px',
          '&:hover': { color: 'text.primary' },
        }}
      >
        <Icon d={d} />
      </Box>
    </Tooltip>
  )

  const avatar = (
    <Box
      component="button"
      type="button"
      onClick={(e: React.MouseEvent<HTMLElement>) => setMenuAnchor(e.currentTarget)}
      aria-label="Account menu"
      aria-haspopup="menu"
      sx={{
        width: 32,
        height: 32,
        display: 'grid',
        placeItems: 'center',
        borderRadius: '50%',
        border: 1,
        borderColor: active === 'profile' ? fp.accent : fp.control,
        bgcolor: 'transparent',
        color: 'text.primary',
        cursor: 'pointer',
        font: 'inherit',
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {initials(user.email)}
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box
        component="a"
        href="#main"
        onClick={(e: React.MouseEvent) => {
          // A hash link would replace the route; move focus instead.
          e.preventDefault()
          document.getElementById('main')?.focus()
        }}
        sx={{
          position: 'fixed',
          left: 12,
          top: -48,
          zIndex: 2000,
          px: 1.5,
          py: 1,
          bgcolor: 'background.paper',
          color: 'text.primary',
          border: 1,
          borderColor: 'divider',
          borderRadius: '6px',
          '&:focus': { top: 12 },
        }}
      >
        Skip to content
      </Box>

      {desktop && (
        <Box
          component="nav"
          aria-label="Sections"
          sx={{
            width: wide ? SIDEBAR : RAIL,
            flexShrink: 0,
            position: 'sticky',
            top: 0,
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: wide ? 'stretch' : 'center',
            px: wide ? 1.5 : 0,
            py: 1.5,
            gap: 0.5,
            borderRight: 1,
            borderColor: 'divider',
            bgcolor: alpha(fp.surface, 0.6),
          }}
        >
          <Box
            component="a"
            href="#/"
            aria-label="Fleet Pulse overview"
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: wide ? 'flex-start' : 'center',
              gap: 1.25,
              height: 48,
              mb: 1.5,
              px: wide ? 1.25 : 0,
              textDecoration: 'none',
              color: 'text.primary',
            }}
          >
            <Mark size={wide ? 28 : 24} />
            {wide && (
              <Box sx={{ lineHeight: 1.15 }}>
                <Typography sx={{ fontFamily: HEADING, fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em' }}>
                  Fleet Pulse
                </Typography>
                <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Network operations</Typography>
              </Box>
            )}
          </Box>
          {NAV.map(({ path, label, icon }) => {
            const selected = active === path
            const n = path === 'disconnections' && offline > 0 ? offline : 0
            return (
              <Tooltip key={path} title={wide ? '' : label} placement="right">
                <Box
                  component="a"
                  href={`#/${path}`}
                  aria-label={label}
                  aria-current={selected ? 'page' : undefined}
                  sx={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: wide ? 'flex-start' : 'center',
                    gap: 1.5,
                    width: wide ? 'auto' : 44,
                    height: 44,
                    px: wide ? 1.5 : 0,
                    borderRadius: '12px',
                    fontSize: 14,
                    fontWeight: selected ? 600 : 500,
                    textDecoration: 'none',
                    color: selected ? fp.accent : 'text.secondary',
                    bgcolor: selected ? alpha(fp.accent, 0.14) : 'transparent',
                    boxShadow: selected ? `inset 0 0 0 1px ${alpha(fp.accent, 0.4)}, 0 0 18px ${alpha(fp.accent, 0.18)}` : 'none',
                    transition: 'background-color .15s, color .15s',
                    '&:hover': { color: selected ? fp.accent : 'text.primary', bgcolor: selected ? alpha(fp.accent, 0.18) : alpha(fp.text, 0.06) },
                  }}
                >
                  <Icon d={icon} />
                  {wide && <Box component="span" sx={{ flex: 1 }}>{label}</Box>}
                  {wide && n > 0 && (
                    <Box
                      component="span"
                      aria-label={`${n} devices offline now`}
                      sx={{ minWidth: 22, height: 20, px: '7px', borderRadius: 999, bgcolor: fp.offline, color: '#fff', fontSize: 11, fontWeight: 700, lineHeight: '20px', textAlign: 'center' }}
                    >
                      {n}
                    </Box>
                  )}
                  {!wide && count(path)}
                </Box>
              </Tooltip>
            )
          })}
          <Box sx={{ flex: 1 }} />
          {wide ? (
            <>
              <Box
                component="button"
                type="button"
                onClick={toggle}
                sx={{ display: 'flex', alignItems: 'center', gap: 1.5, height: 40, px: 1.5, border: 0, borderRadius: '10px', bgcolor: 'transparent', color: 'text.secondary', font: 'inherit', fontSize: 13, cursor: 'pointer', '&:hover': { color: 'text.primary', bgcolor: alpha(fp.text, 0.06) } }}
              >
                <Icon d={mode === 'dark' ? ICONS.sun : ICONS.moon} />
                {mode === 'dark' ? 'Day theme' : 'Night theme'}
              </Box>
              <Box
                component="button"
                type="button"
                onClick={(e: React.MouseEvent<HTMLElement>) => setMenuAnchor(e.currentTarget)}
                aria-label="Account menu"
                aria-haspopup="menu"
                sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: 1.25, mt: 0.5, textAlign: 'left', border: 1, borderColor: 'divider', borderRadius: '12px', bgcolor: alpha(fp.text, 0.03), color: 'text.primary', font: 'inherit', cursor: 'pointer', '&:hover': { borderColor: fp.control } }}
              >
                <Box sx={{ width: 32, height: 32, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: '50%', bgcolor: alpha(fp.accent, 0.16), color: fp.accent, fontSize: 12, fontWeight: 700 }}>
                  {initials(user.email)}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: 13, fontWeight: 600 }}>{user.email}</Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary', textTransform: 'capitalize' }}>{user.role}</Typography>
                </Box>
              </Box>
            </>
          ) : (
            <>
              {iconButton(themeLabel, toggle, mode === 'dark' ? ICONS.sun : ICONS.moon)}
              <Box sx={{ mt: 1 }}>{avatar}</Box>
            </>
          )}
        </Box>
      )}

      <Box sx={{ flexGrow: 1, minWidth: 0, pb: { xs: 9, md: 0 } }}>
        <Box
          component="header"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            height: 56,
            px: { xs: 2, md: 4 },
            borderBottom: 1,
            borderColor: 'divider',
            position: 'sticky',
            top: 0,
            zIndex: 2,
            bgcolor: alpha(fp.bg, 0.78),
            backdropFilter: 'blur(14px)',
          }}
        >
          {!desktop && (
            <Box
              component="a"
              href="#/"
              aria-label="Fleet Pulse overview"
              sx={{ display: 'grid', placeItems: 'center' }}
            >
              <Mark size={22} />
            </Box>
          )}
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexGrow: 1, minWidth: 0 }}>
            <Typography
              sx={{ fontSize: 13, color: 'text.secondary', display: { xs: 'none', sm: wide ? 'none' : 'block' }, whiteSpace: 'nowrap' }}
            >
              Fleet Pulse /
            </Typography>
            <Typography
              component="h1"
              sx={{
                fontFamily: HEADING,
                fontSize: { xs: 20, md: 22 },
                fontWeight: 600,
                letterSpacing: '-0.01em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {title}
            </Typography>
          </Box>
          <DeviceSearch onUnauthorized={onLogout} />
          <Live />
          <Pulse summary={summary} />
          {!desktop && (
            <>
              {iconButton(themeLabel, toggle, mode === 'dark' ? ICONS.sun : ICONS.moon)}
              {avatar}
            </>
          )}
        </Box>

        <Box component="main" id="main" tabIndex={-1} sx={{ outline: 'none', px: { xs: 2, md: 4 }, py: 3 }}>
          {children}
        </Box>
      </Box>

      {!desktop && (
        // On a phone the rail becomes a bottom bar: the same icons, each with a short label.
        <Box
          component="nav"
          aria-label="Sections"
          sx={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1100,
            display: 'grid',
            gridTemplateColumns: `repeat(${NAV.length}, 1fr)`,
            bgcolor: 'background.default',
            borderTop: 1,
            borderColor: 'divider',
            pb: 'env(safe-area-inset-bottom)',
          }}
        >
          {NAV.map(({ path, short, icon }) => {
            const selected = active === path
            return (
              <Box
                key={path}
                component="a"
                href={`#/${path}`}
                aria-current={selected ? 'page' : undefined}
                sx={{
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 0.25,
                  pt: 1,
                  pb: 0.75,
                  minHeight: 56,
                  fontSize: 11,
                  textDecoration: 'none',
                  color: selected ? 'text.primary' : 'text.secondary',
                  '&::before': selected
                    ? {
                        content: '""',
                        position: 'absolute',
                        top: -1,
                        left: '25%',
                        right: '25%',
                        height: '1px',
                        bgcolor: fp.accent,
                      }
                    : undefined,
                }}
              >
                <Icon d={icon} size={20} />
                {short}
                {count(path)}
              </Box>
            )
          })}
        </Box>
      )}

      <Menu
        anchorEl={menuAnchor}
        open={!!menuAnchor}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={desktop ? { vertical: 'top', horizontal: 'right' } : { vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={
          desktop ? { vertical: 'bottom', horizontal: 'left' } : { vertical: 'top', horizontal: 'right' }
        }
        slotProps={{ paper: { sx: { minWidth: 220 } } }}
      >
        <Box sx={{ px: 2, py: 1.25 }}>
          <Typography sx={{ fontWeight: 600, fontSize: 13 }}>{user.email}</Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary', textTransform: 'capitalize' }}>
            {user.role}
          </Typography>
        </Box>
        <Divider />
        <MenuItem component="a" href="#/profile" onClick={() => setMenuAnchor(null)}>
          Profile
        </MenuItem>
        <MenuItem onClick={onLogout}>Sign out</MenuItem>
      </Menu>
    </Box>
  )
}
