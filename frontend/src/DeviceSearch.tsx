import { Box, Typography, useTheme } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { api, UnauthorizedError, type Device } from './api.ts'
import { Icon } from './common.tsx'
import { ICONS } from './icons.ts'

/**
 * Jump to any device from the top bar: type a name or id, pick a result. The device
 * list loads the first time the box is used; "/" focuses it from anywhere.
 */
export default function DeviceSearch({ onUnauthorized }: { onUnauthorized: () => void }) {
  const { fp } = useTheme().palette
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [devices, setDevices] = useState<Device[] | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const loading = useRef(false)

  const load = () => {
    if (devices || loading.current) return
    loading.current = true
    api<Device[]>('/devices')
      .then(setDevices)
      .catch((e) => {
        loading.current = false
        if (e instanceof UnauthorizedError) onUnauthorized()
      })
  }

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === '/' && !/input|textarea|select/i.test((e.target as HTMLElement)?.tagName ?? '')) {
        e.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const results = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t || !devices) return []
    return devices.filter((d) => d.name.toLowerCase().includes(t) || d.deviceId.toLowerCase().includes(t)).slice(0, 7)
  }, [q, devices])

  const go = (d: Device) => {
    location.hash = `#/devices/${encodeURIComponent(d.deviceId)}`
    setQ('')
    setOpen(false)
    input.current?.blur()
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && results[active]) go(results[active])
    else if (e.key === 'Escape') {
      setOpen(false)
      input.current?.blur()
    }
  }

  const color = { online: fp.online, offline: fp.offline, unknown: fp.unknown }
  const showList = open && q.trim() !== ''

  return (
    <Box sx={{ position: 'relative', display: { xs: 'none', sm: 'block' }, width: { sm: 200, lg: 300 } }}>
      <Box sx={{ position: 'absolute', left: 11, top: 0, bottom: 0, display: 'grid', placeItems: 'center', opacity: 0.6, pointerEvents: 'none' }}>
        <Icon d={ICONS.search} size={15} />
      </Box>
      <Box
        component="input"
        ref={input}
        role="combobox"
        aria-expanded={showList}
        aria-controls="device-search-list"
        aria-label="Search devices"
        autoComplete="off"
        spellCheck={false}
        placeholder="Search devices"
        value={q}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          setQ(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => {
          load()
          setOpen(true)
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        sx={{
          width: '100%',
          height: 34,
          pl: '34px',
          pr: '30px',
          font: 'inherit',
          fontSize: 13,
          color: 'text.primary',
          bgcolor: alpha(fp.text, 0.04),
          border: 1,
          borderColor: 'divider',
          borderRadius: 999,
          outline: 'none',
          '&::placeholder': { color: fp.muted },
          '&:focus': { borderColor: fp.accent, boxShadow: `0 0 0 3px ${alpha(fp.accent, 0.18)}` },
        }}
      />
      {!q && (
        <Box
          component="kbd"
          aria-hidden
          sx={{ position: 'absolute', right: 10, top: 8, px: 0.75, borderRadius: '6px', border: 1, borderColor: 'divider', fontSize: 11, lineHeight: '16px', color: 'text.secondary', fontFamily: 'inherit' }}
        >
          /
        </Box>
      )}
      {showList && (
        <Box
          id="device-search-list"
          role="listbox"
          // mousedown, not click: the input blurs (and closes the list) before a click lands.
          onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
          sx={{
            position: 'absolute',
            top: 40,
            left: 0,
            right: 0,
            minWidth: 280,
            zIndex: 20,
            p: 0.5,
            bgcolor: 'background.paper',
            border: 1,
            borderColor: 'divider',
            borderRadius: '12px',
            boxShadow: '0 16px 40px -12px rgba(0,0,0,.6)',
          }}
        >
          {!devices && <Typography sx={{ p: 1.5, fontSize: 13, color: 'text.secondary' }}>Loading…</Typography>}
          {devices && results.length === 0 && (
            <Typography sx={{ p: 1.5, fontSize: 13, color: 'text.secondary' }}>No device matches “{q.trim()}”.</Typography>
          )}
          {results.map((d, i) => (
            <Box
              key={d.deviceId}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(d)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
                px: 1.25,
                py: 0.9,
                borderRadius: '8px',
                cursor: 'pointer',
                bgcolor: i === active ? alpha(fp.accent, 0.12) : 'transparent',
              }}
            >
              <Box sx={{ width: 8, height: 8, flex: 'none', borderRadius: '50%', bgcolor: color[d.status], boxShadow: `0 0 8px ${color[d.status]}` }} />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography noWrap sx={{ fontSize: 13, fontWeight: 500 }}>
                  {d.name}
                </Typography>
                <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary' }}>
                  {d.deviceId}, {d.site}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
