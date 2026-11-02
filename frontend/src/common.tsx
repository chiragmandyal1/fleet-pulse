import {
  Box,
  InputAdornment,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useTheme,
  type SxProps,
  type Theme,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import { LineChart, lineClasses } from '@mui/x-charts/LineChart'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { LinkStatus } from './api.ts'
import { ICONS } from './icons.ts'
import { WINDOWS } from './lib.ts'
import { HEADING, LABEL } from './theme.ts'

/**
 * A panel: a card that catches a little light from above (a soft top highlight and
 * an inner edge), a quiet border, 12px corners. Every block on a screen sits in one.
 */
export function Panel({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  const { fp } = useTheme().palette
  return (
    <Box
      sx={[
        {
          position: 'relative',
          bgcolor: 'background.paper',
          backgroundImage: `linear-gradient(180deg, ${alpha(fp.text, 0.035)} 0%, ${alpha(fp.text, 0)} 140px)`,
          border: 1,
          borderColor: 'divider',
          borderRadius: '12px',
          boxShadow: `inset 0 1px 0 ${alpha(fp.text, 0.05)}, 0 8px 28px -16px rgba(0, 0, 0, 0.55)`,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  )
}

/** Pale tint with the status in words: colour plus text, never colour alone. */
export function Pill({ color, children }: { color: string; children: ReactNode }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        flex: 'none',
        alignItems: 'center',
        gap: 0.75,
        px: 1,
        height: 22,
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        color,
        bgcolor: alpha(color, 0.12),
        boxShadow: `inset 0 0 0 1px ${alpha(color, 0.28)}`,
        whiteSpace: 'nowrap',
      }}
    >
      <Box
        component="span"
        sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: color, flexShrink: 0, boxShadow: `0 0 8px ${color}` }}
      />
      {children}
    </Box>
  )
}

export function StatusChip({ status }: { status: LinkStatus }) {
  const { fp } = useTheme().palette
  return <Pill color={{ online: fp.online, offline: fp.offline, unknown: fp.unknown }[status]}>{status}</Pill>
}

/** A label over a value: 12px, sentence case, the muted grey. */
export function Label({ children }: { children: ReactNode }) {
  return (
    <Typography component="div" sx={{ ...LABEL, color: 'text.secondary' }} noWrap>
      {children}
    </Typography>
  )
}

export interface Kpi {
  label: string
  value: string | number
  /** A real colour value, not a theme path. Status colours only. */
  color?: string
  /** Recent values, drawn as a small trend line in the tile's corner. */
  spark?: number[]
  hint?: string
  /** The figure that answers the screen's question: set larger than its siblings. */
  lead?: boolean
}

/** A number that rolls from its last value to the new one; words and dashes pass straight through. */
function CountUp({ value }: { value: number | string }) {
  const still = typeof value !== 'number' || matchMedia('(prefers-reduced-motion: reduce)').matches
  const [n, setN] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    if (still) return
    const start = from.current
    const t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 700)
      setN(Math.round(start + ((value as number) - start) * (1 - (1 - k) ** 3)))
      if (k < 1) raf = requestAnimationFrame(step)
      else from.current = value as number
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, still])
  return <>{typeof value === 'number' ? (still ? value : n).toLocaleString() : value}</>
}

/** A tiny trend line in a tile's corner: the shape of the last hours, no axes. */
function Spark({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null
  const w = 72
  const h = 30
  const min = Math.min(...data)
  const span = Math.max(Math.max(...data) - min, 1e-9)
  const line = data
    .map((v, i) => `${i ? 'L' : 'M'}${((i / (data.length - 1)) * w).toFixed(1)},${(h - 3 - ((v - min) / span) * (h - 8)).toFixed(1)}`)
    .join('')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden style={{ position: 'absolute', right: 16, bottom: 14 }}>
      <path d={`${line}L${w},${h}L0,${h}Z`} fill={alpha(color, 0.14)} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 4px ${alpha(color, 0.6)})` }}
      />
    </svg>
  )
}

/**
 * Headline numbers as separate tiles: a small label, a large display figure and a
 * grey hint. A tile with a status colour carries a soft wash of it in its corner,
 * so a red tile reads as red before it is read.
 */
export function KpiStrip({ items, compact }: { items: Kpi[]; compact?: boolean }) {
  const { fp } = useTheme().palette
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 2,
        gridTemplateColumns: { xs: '1fr 1fr', md: `repeat(${items.length}, minmax(0, 1fr))` },
      }}
    >
      {items.map((k, i) => (
        <Panel
          key={k.label}
          sx={{
            px: 2.5,
            py: 2,
            minWidth: 0,
            overflow: 'hidden',
            // An odd last item takes the whole row on phones instead of half of it.
            gridColumn: { xs: i === items.length - 1 && items.length % 2 ? 'span 2' : 'auto', md: 'auto' },
            ...(k.color && {
              backgroundImage: `radial-gradient(180px 90px at 100% 0%, ${alpha(k.color, 0.16)}, transparent 70%)`,
            }),
          }}
        >
          {k.spark && <Spark data={k.spark} color={k.color ?? fp.accent} />}
          <Label>{k.label}</Label>
          <Typography
            sx={{
              fontFamily: HEADING,
              fontSize: k.lead ? (compact ? 32 : 40) : compact ? 24 : 32,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              lineHeight: 1.15,
              mt: 0.75,
              color: k.color,
              whiteSpace: 'nowrap',
            }}
          >
            <CountUp value={k.value} />
          </Typography>
          {k.hint && (
            <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }} noWrap>
              {k.hint}
            </Typography>
          )}
        </Panel>
      ))}
    </Box>
  )
}

/** What the three device states mean, shown from one info button next to the legend. */
function StateInfo() {
  const { fp } = useTheme().palette
  const rows = [
    { color: fp.online, name: 'Online', text: 'Reporting, and its link is up.' },
    { color: fp.offline, name: 'Offline', text: 'Reporting, and its link is down. A real outage.' },
    {
      color: fp.unknown,
      name: 'Silent',
      text: 'No report for 2+ minutes, so its state is unknown. Often power, modem or network, not a confirmed link drop.',
    },
  ]
  return (
    <Tooltip
      placement="bottom-start"
      enterTouchDelay={0}
      leaveTouchDelay={6000}
      slotProps={{ tooltip: { sx: { maxWidth: 320, p: 1.5 } } }}
      title={
        <Box sx={{ display: 'grid', gap: 1 }}>
          {rows.map((r) => (
            <Box key={r.name} sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
              <Box sx={{ width: 8, height: 8, flex: 'none', borderRadius: '50%', bgcolor: r.color }} />
              <Box sx={{ fontSize: 12, lineHeight: 1.45 }}>
                <Box component="span" sx={{ fontWeight: 600 }}>
                  {r.name}:{' '}
                </Box>
                {r.text}
              </Box>
            </Box>
          ))}
        </Box>
      }
    >
      <Box
        component="button"
        type="button"
        aria-label="What online, offline and silent mean"
        sx={{
          width: 18,
          height: 18,
          p: 0,
          display: 'grid',
          placeItems: 'center',
          borderRadius: '50%',
          border: 1,
          borderColor: 'text.secondary',
          bgcolor: 'transparent',
          color: 'text.secondary',
          font: 'inherit',
          fontSize: 11,
          fontWeight: 700,
          fontStyle: 'italic',
          lineHeight: 1,
          cursor: 'help',
          '&:hover, &:focus-visible': { color: 'text.primary', borderColor: 'text.primary' },
        }}
      >
        i
      </Box>
    </Tooltip>
  )
}

/**
 * The first thing on the overview: how healthy the fleet is, as a ring with the
 * availability in its middle, one plain sentence, and a bar splitting the devices
 * into online, silent and offline. The ring and the wash take the status colour.
 */
export function HealthHero({
  availability,
  online,
  unknown,
  offline,
  finding,
  windowLabel,
  action,
}: {
  availability?: number | null
  online?: number
  unknown?: number
  offline?: number
  finding: string
  windowLabel?: string
  action?: ReactNode
}) {
  const { fp } = useTheme().palette
  const total = (online ?? 0) + (unknown ?? 0) + (offline ?? 0)
  const pct = availability == null ? null : Math.max(0, Math.min(1, availability))
  // Green when the fleet is healthy, amber when it is dented, red only when it is in trouble.
  const tone = pct == null || pct >= 0.97 ? fp.online : pct >= 0.9 ? fp.degraded : fp.offline
  const R = 54
  const CIRC = 2 * Math.PI * R
  const segs = [
    { key: 'online', n: online ?? 0, color: fp.online, label: 'online' },
    { key: 'unknown', n: unknown ?? 0, color: fp.unknown, label: 'silent' },
    { key: 'offline', n: offline ?? 0, color: fp.offline, label: 'offline' },
  ]
  return (
    <Panel
      sx={{
        overflow: 'hidden',
        p: { xs: 2.5, md: 3.5 },
        backgroundImage: `radial-gradient(700px 260px at 0% 0%, ${alpha(tone, 0.14)}, transparent 65%), linear-gradient(180deg, ${alpha(fp.text, 0.035)} 0%, ${alpha(fp.text, 0)} 140px)`,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: { xs: 2.5, md: 4 },
          flexWrap: { xs: 'wrap', md: 'nowrap' },
        }}
      >
        <Box
          role="img"
          aria-label={pct == null ? 'Availability loading' : `Availability ${(pct * 100).toFixed(1)} percent`}
          sx={{ position: 'relative', width: 132, height: 132, flex: 'none' }}
        >
          <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden>
            <circle cx="66" cy="66" r={R} fill="none" stroke={fp.rule} strokeWidth="9" />
            <circle
              cx="66"
              cy="66"
              r={R}
              fill="none"
              stroke={tone}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${(pct ?? 0) * CIRC} ${CIRC}`}
              transform="rotate(-90 66 66)"
              style={{ filter: `drop-shadow(0 0 6px ${alpha(tone, 0.6)})`, transition: 'stroke-dasharray .6s ease' }}
            />
          </svg>
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', textAlign: 'center' }}>
            <Typography
              sx={{ fontFamily: HEADING, fontWeight: 600, fontSize: 28, letterSpacing: '-0.02em', lineHeight: 1 }}
            >
              {pct == null ? '—' : `${(pct * 100).toFixed(1)}%`}
            </Typography>
            <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 0.5 }}>
              available{windowLabel ? `, ${windowLabel}` : ''}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ flex: '1 1 320px', minWidth: 0 }}>
          <Typography
            component="p"
            sx={{
              fontFamily: HEADING,
              fontWeight: 600,
              fontSize: { xs: 20, md: 26 },
              lineHeight: 1.25,
              letterSpacing: '-0.015em',
              maxWidth: '34ch',
              textWrap: 'balance',
            }}
          >
            {finding}
          </Typography>
          <Box
            role="img"
            aria-label={segs.map((g) => `${g.n} ${g.label}`).join(', ')}
            sx={{ display: 'flex', gap: '3px', height: 10, mt: 2.5, maxWidth: 560 }}
          >
            {total === 0 && <Box sx={{ flex: 1, borderRadius: 999, bgcolor: 'divider' }} />}
            {segs
              .filter((g) => g.n > 0)
              .map((g) => (
                <Box
                  key={g.key}
                  sx={{
                    flex: g.n,
                    // A thin sliver of red must still be visible next to a wall of green.
                    minWidth: 6,
                    borderRadius: 999,
                    bgcolor: g.color,
                    boxShadow: `0 0 10px ${alpha(g.color, 0.45)}`,
                  }}
                />
              ))}
          </Box>
          <Box sx={{ display: 'flex', gap: 2.5, mt: 1.25, flexWrap: 'wrap', alignItems: 'center' }}>
            {segs.map((g) => (
              <Box key={g.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 13 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: g.color }} />
                <Box component="span" sx={{ fontWeight: 600 }}>
                  {online == null ? '—' : g.n}
                </Box>
                <Box component="span" sx={{ color: 'text.secondary' }}>
                  {g.label}
                </Box>
              </Box>
            ))}
            <StateInfo />
          </Box>
        </Box>

        {action && <Box sx={{ alignSelf: { xs: 'flex-start', md: 'flex-start' }, flex: 'none' }}>{action}</Box>}
      </Box>
    </Panel>
  )
}

/** A framed panel with a title row: title and optional note on the left, an optional control on the right. */
export function Section({
  title,
  note,
  action,
  children,
  flush,
}: {
  title: ReactNode
  note?: string
  action?: ReactNode
  children: ReactNode
  /** Content runs to the panel edges (tables, maps, lists). */
  flush?: boolean
}) {
  return (
    <Panel sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          px: 2.5,
          pt: 1.75,
          pb: 1.5,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h2" sx={{ fontFamily: HEADING, fontWeight: 600, fontSize: 17, lineHeight: 1.3 }}>
            {title}
          </Typography>
          {note && <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>{note}</Typography>}
        </Box>
        {action}
      </Box>
      <Box sx={{ px: flush ? 0 : 2, pb: flush ? 0 : 1.5, flexGrow: 1, minWidth: 0, ...(flush && { overflow: 'hidden', borderBottomLeftRadius: 12, borderBottomRightRadius: 12 }) }}>{children}</Box>
    </Panel>
  )
}

/** Page-level heading row: an h2 with a muted line under it, and a control on the right. */
export function SubHeader({ title, note, action }: { title: string; note?: string; action?: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
      <Box>
        <Typography
          component="h2"
          sx={{ fontFamily: HEADING, fontWeight: 500, fontSize: 20, lineHeight: 1.25, color: 'text.secondary' }}
        >
          {title}
        </Typography>
        {note && <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{note}</Typography>}
      </Box>
      {action}
    </Box>
  )
}

export function HoursToggle({
  value,
  onChange,
  options = WINDOWS,
}: {
  value: number
  onChange: (hours: number) => void
  options?: { hours: number; label: string }[]
}) {
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={value}
      onChange={(_, v) => v && onChange(v)}
      aria-label="Time window"
    >
      {options.map((w) => (
        <ToggleButton key={w.hours} value={w.hours}>
          {w.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
}

const timeLabel = (hours: number) => (d: Date) =>
  hours > 168
    ? d.toLocaleDateString([], { day: 'numeric', month: 'short' })
    : hours > 24
    ? d.toLocaleDateString([], { weekday: 'short', day: 'numeric' })
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/** One time series: a 2px straight line over a flat 10% wash, faint solid grid, no axis lines. */
export function TrendChart({
  x,
  data,
  color,
  label,
  hours,
  height = 220,
  yMin,
  children,
}: {
  x: Date[]
  data: (number | null)[]
  color: string
  label: string
  hours: number
  height?: number
  yMin?: number
  children?: ReactNode
}) {
  const { fp } = useTheme().palette
  return (
    <LineChart
      height={height}
      hideLegend
      grid={{ horizontal: true }}
      margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
      xAxis={[{ data: x, scaleType: 'time', valueFormatter: timeLabel(hours) }]}
      yAxis={[{ min: yMin, width: 40 }]}
      series={[{ data, label, color, area: true, showMark: false, curve: 'linear', baseline: 'min' }]}
      sx={{
        [`& .${lineClasses.area}`]: { fillOpacity: 0.2 },
        [`& .${lineClasses.line}`]: { strokeWidth: 2.5, filter: `drop-shadow(0 0 5px ${alpha(color, 0.55)})` },
        '& .MuiChartsAxis-line, & .MuiChartsAxis-tick': { display: 'none' },
        '& .MuiChartsAxis-tickLabel': { fill: `${fp.muted} !important`, fontSize: '12px !important' },
        '& .MuiChartsGrid-line': { stroke: fp.rule, strokeDasharray: '3 5' },
      }}
    >
      {children}
    </LineChart>
  )
}

/** Short muted line under the page title: what the page is for, in one sentence. */
export function Intro({ children }: { children: ReactNode }) {
  return <Typography sx={{ fontSize: 13, color: 'text.secondary', maxWidth: '75ch' }}>{children}</Typography>
}

/** A Lucide-style line icon from a path in ICONS. */
export function Icon({ d, size = 18, color = 'currentColor' }: { d: string; size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      style={{
        flex: 'none',
        fill: 'none',
        stroke: color,
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }}
    >
      <path d={d} />
    </svg>
  )
}

/** The search box that sits in a panel's title row, driving the table's quick filter. */
export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <TextField
      size="small"
      type="search"
      name="search"
      autoComplete="off"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      sx={{ width: { xs: '100%', sm: 280 } }}
      slotProps={{
        htmlInput: { 'aria-label': placeholder.replace(/…$/, '') },
        input: {
          startAdornment: (
            <InputAdornment position="start" sx={{ opacity: 0.6 }}>
              <Icon d={ICONS.search} size={16} />
            </InputAdornment>
          ),
        },
      }}
    />
  )
}

/**
 * A device's name as a real link, so Cmd/Ctrl-click and middle-click open it in a new tab.
 * Rows also open on a plain click (see `openRow`).
 */
export function DeviceLink({ id, children }: { id: string; children: ReactNode }) {
  return (
    <Box
      component="a"
      href={`#/devices/${encodeURIComponent(id)}`}
      sx={{ color: 'inherit', textDecoration: 'none', '&:hover': { color: 'inherit', textDecoration: 'underline' } }}
    >
      {children}
    </Box>
  )
}
