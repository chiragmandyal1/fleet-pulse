export type Role = 'admin' | 'customer' | 'viewer'
export type LinkStatus = 'online' | 'offline' | 'unknown'

export interface User {
  email: string
  role: Role
  customerId?: string
}

export interface Device {
  deviceId: string
  name: string
  kind: 'fixed' | 'mobile' | 'hybrid'
  customerId: string
  site: string
  lat: number
  lon: number
  rfThreshold: number
  satellite: string
  beam: 'North' | 'East' | 'West' | 'South'
  sim?: { iccid: string; carrier: string; planGb: number }
  status: LinkStatus
  lastSeen: string | null
  bandwidth: number | null
  rfSignal: number | null
}

export interface TrendPoint {
  bucket: string
  availability: number
  onlineDevices: number
  avgBandwidth: number | null
  samples: number
}

export interface Summary {
  hours: number
  counts: Record<LinkStatus | 'total', number>
  availability: number | null
  trend: TrendPoint[]
}

export interface Disconnection {
  deviceId: string
  name?: string
  customerId?: string
  start: string
  /** Null while the device is still down. */
  end: string | null
  durationSec: number
}

export interface Customer {
  customerId: string
  name: string
  sector: string
}

/** The token expired or was rejected; the app drops back to the login screen. */
export class UnauthorizedError extends Error {}

const KEY = 'fleetpulse.session'
type Session = { token: string; user: User }

// Storage can throw (private mode, blocked site data); a failed read just means "logged out".
export const session = {
  get(): Session | null {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? 'null')
    } catch {
      return null
    }
  },
  set(s: Session) {
    try {
      localStorage.setItem(KEY, JSON.stringify(s))
    } catch {
      /* stays logged in for this tab only */
    }
  },
  clear() {
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* nothing to clear */
    }
  },
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = session.get()?.token
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token && { authorization: `Bearer ${token}` }),
      ...init?.headers,
    },
  })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.message ?? `${res.status} ${res.statusText}`)
  }
  return res.json()
}

export async function login(email: string, password: string): Promise<User> {
  const res = await api<{ accessToken: string; user: User }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  session.set({ token: res.accessToken, user: res.user })
  return res.user
}
