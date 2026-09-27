import { useState } from 'react';
import { useAuth } from '../AuthContext';

export default function Header() {
  const { firebaseUser, signOut } = useAuth();
  const [logoOk, setLogoOk] = useState(true);

  return (
    <header className="app-header">
      <div className="app-header-inner">
        {logoOk ? (
          <img
            src="/lezzflow-horizontal-dark.png"
            alt="LezzFlow"
            className="brand-logo"
            onError={() => setLogoOk(false)}
          />
        ) : (
          <span className="brand-word">LezzFlow</span>
        )}
        <span className="app-tag">Partner</span>
        <span className="flex-spacer" />
        {firebaseUser ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={signOut}>
            Sign out
          </button>
        ) : null}
      </div>
    </header>
  );
}
