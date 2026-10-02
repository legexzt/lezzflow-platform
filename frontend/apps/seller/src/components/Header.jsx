import { useState } from 'react'
import { useAuth } from '../AuthContext.jsx'
import { signOutUser } from '../firebase.js'
import NotificationBell from './NotificationBell.jsx'

export default function Header() {
  const { user } = useAuth()
  const [logoOk, setLogoOk] = useState(true)
  const displayName = user?.name || user?.displayName || user?.email || ''

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="brand">
          {logoOk ? (
            <img
              src="/brand-banner.png"
              alt="LezzFlow"
              className="brand-logo"
              style={{ height: '38px', width: 'auto' }}
              onError={() => setLogoOk(false)}
            />
          ) : (
            <span className="brand-word">Lezz<span>Flow</span></span>
          )}
          <span className="brand-badge">Seller</span>
        </div>
        <div className="header-right">
          {displayName && <span className="header-user">{displayName.split(' ')[0]}</span>}
          <NotificationBell />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => signOutUser()}>
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
