import { useState } from 'react'
import { useAuth } from '../AuthContext.jsx'
import { signOutUser } from '../firebase.js'

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
              src="/logo-dark.png"
              alt="LezzFlow"
              className="brand-logo"
              onError={() => setLogoOk(false)}
            />
          ) : (
            <span className="brand-word">LezzFlow</span>
          )}
          <span className="brand-badge">Seller</span>
        </div>
        <div className="header-right">
          {displayName && <span className="header-user">{displayName.split(' ')[0]}</span>}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => signOutUser()}>
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
