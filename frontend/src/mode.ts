import { createContext, useContext } from 'react'
import type { Mode } from './theme.ts'

export const ModeContext = createContext<{ mode: Mode; toggle: () => void }>({ mode: 'dark', toggle: () => {} })
export const useMode = () => useContext(ModeContext)

const KEY = 'fleetpulse.theme'

/** Saved choice first, then night: the product is built for a dark wall display. Storage can throw; that just means no saved choice. */
export function initialMode(): Mode {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* fall through */
  }
  return 'dark'
}

export function saveMode(mode: Mode) {
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    /* remembered for this tab only */
  }
}
