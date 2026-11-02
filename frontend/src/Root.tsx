import { CssBaseline, ThemeProvider } from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import App from './App.tsx'
import { initialMode, ModeContext, saveMode } from './mode.ts'
import { makeTheme } from './theme.ts'

/** Owns the day/night choice and hands the matching theme to everything below. */
export default function Root() {
  const [mode, setMode] = useState(initialMode)
  const theme = useMemo(() => makeTheme(mode), [mode])
  // Browser chrome (mobile address bar, overscroll) follows the page ground.
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.palette.background.default)
  }, [theme])
  const ctx = useMemo(
    () => ({
      mode,
      toggle: () =>
        setMode((m) => {
          const next = m === 'dark' ? 'light' : 'dark'
          saveMode(next)
          return next
        }),
    }),
    [mode],
  )
  return (
    <ModeContext.Provider value={ctx}>
      <ThemeProvider theme={theme}>
        <CssBaseline enableColorScheme />
        <App />
      </ThemeProvider>
    </ModeContext.Provider>
  )
}
