import { useCallback, useEffect, useState } from 'react'
import { login, session, type User } from './api.ts'
import Dashboard from './Dashboard.tsx'
import DevicePage from './DevicePage.tsx'
import DishPage from './DishPage.tsx'
import DisconnectionsPage from './DisconnectionsPage.tsx'
import Login from './Login.tsx'
import ProfilePage from './ProfilePage.tsx'
import ReportsPage from './ReportsPage.tsx'
import SatellitePage from './SatellitePage.tsx'
import Shell from './Shell.tsx'
import SimPage from './SimPage.tsx'

/**
 * A handful of screens, so a hash route instead of a router: `#/dish` or
 * `#/devices/FP-00042` is shareable, and a static server needs no fallback rule.
 */
function parseHash(): { page: string; deviceId?: string } {
  const path = location.hash.replace(/^#\/?/, '')
  const device = /^devices\/(.+)$/.exec(path)
  return device ? { page: 'device', deviceId: decodeURIComponent(device[1]) } : { page: path }
}

/**
 * `?demo=admin|viewer|customer` signs straight into that public demo account, so a
 * portfolio link (or a screenshot tool) can open any screen without the login form.
 * Uses only the demo password the login page already shows.
 */
const DEMO_ACCOUNTS: Record<string, string> = {
  admin: 'admin@fleetpulse.dev',
  viewer: 'viewer@fleetpulse.dev',
  customer: 'northwind@fleetpulse.dev',
}

const TITLES: Record<string, string> = {
  '': 'Overview',
  dish: 'Dish health',
  sims: 'SIM cards',
  satellites: 'Satellites',
  reports: 'Reports',
  disconnections: 'Disconnections',
  profile: 'Profile',
}

export default function App() {
  const [user, setUser] = useState<User | null>(() => session.get()?.user ?? null)
  const [route, setRoute] = useState(parseHash)
  const [demo, setDemo] = useState<string | undefined>(
    () => DEMO_ACCOUNTS[new URLSearchParams(location.search).get('demo') ?? ''],
  )

  useEffect(() => {
    if (!demo) return
    // Drop the parameter so a reload or a shared link doesn't re-run it.
    history.replaceState(null, '', location.pathname + location.hash)
    if (session.get()?.user.email === demo) return
    login(demo, 'fleetpulse').then(setUser, () => setDemo(undefined))
  }, [demo])

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const logout = useCallback(() => {
    session.clear()
    setUser(null)
  }, [])

  if (!user || (demo && user.email !== demo)) return <Login onLogin={setUser} />

  const { deviceId } = route
  // Unknown paths fall back to the overview rather than a blank screen.
  const page = deviceId ? 'device' : route.page in TITLES ? route.page : ''
  const props = { user, onLogout: logout }

  return (
    <Shell {...props} active={page === 'device' ? null : page} title={deviceId ? `Device ${deviceId}` : TITLES[page]}>
      {page === 'device' && <DevicePage key={deviceId} deviceId={deviceId!} {...props} />}
      {page === '' && <Dashboard {...props} />}
      {page === 'dish' && <DishPage onLogout={logout} />}
      {page === 'sims' && <SimPage onLogout={logout} />}
      {page === 'satellites' && <SatellitePage onLogout={logout} />}
      {page === 'reports' && <ReportsPage />}
      {page === 'disconnections' && <DisconnectionsPage {...props} />}
      {page === 'profile' && <ProfilePage {...props} />}
    </Shell>
  )
}
