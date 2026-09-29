import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { useLang } from '../i18n.jsx';
import NotifBell from './NotifBell';

export default function Header() {
  const { firebaseUser, signOut } = useAuth();
  const { lang, setLang, t } = useLang();
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
        {firebaseUser ? <NotifBell /> : null}
        <button
          type="button"
          className="btn btn-ghost btn-sm lang-toggle"
          onClick={() => setLang(lang === 'hi' ? 'en' : 'hi')}
          aria-label="Switch language / भाषा बदलें"
        >
          {lang === 'hi' ? 'EN' : 'हिं'}
        </button>
        {firebaseUser ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={signOut}>
            {t('signOut')}
          </button>
        ) : null}
      </div>
    </header>
  );
}
