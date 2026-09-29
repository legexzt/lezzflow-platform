import { useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import Icon from '../components/Icon';
import { useAuth } from '../AuthContext';
import { useLang } from '../i18n.jsx';
import { loadChecklist, saveChecklist } from '../utils/offlineQueue';

const CHECKLIST_ITEMS = [
  { key: 'phone', labelKey: 'checkPhone' },
  { key: 'bag', labelKey: 'checkBag' },
  { key: 'fuel', labelKey: 'checkFuel' },
  { key: 'idcard', labelKey: 'checkId' },
];

/**
 * More page — everything secondary behind the clean bottom nav.
 * The duty checklist shares localStorage state with the Dashboard one.
 */
export default function More() {
  const { t } = useLang();
  const { signOut } = useAuth();
  const [checklist, setChecklist] = useState(() => loadChecklist());

  function toggleChecklistItem(key) {
    setChecklist((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveChecklist(next);
      return next;
    });
  }

  return (
    <div className="page">
      <Header />
      <main className="container">
        <h1 className="page-title">{t('tabMore')}</h1>

        <section className="card menu-card">
          <Link to="/notifications" className="menu-row">
            <Icon name="bell" size={20} />
            <span>{t('notifTitle')}</span>
          </Link>
          <a href="/?tab=refer" className="menu-row" onClick={(e) => { e.preventDefault(); window.location.href = '/?tab=refer'; }}>
            <Icon name="users" size={20} />
            <span>{t('tabRefer')}</span>
          </a>
        </section>

        <section className="card checklist-card">
          <div className="checklist-head">
            <Icon name="check" size={18} />
            <strong>{t('dutyChecklist')}</strong>
            <span className="muted tiny">
              {Object.values(checklist).filter(Boolean).length}/4
            </span>
          </div>
          <ul className="checklist">
            {CHECKLIST_ITEMS.map((item) => (
              <li key={item.key}>
                <label className="checklist-item">
                  <input
                    type="checkbox"
                    checked={!!checklist[item.key]}
                    onChange={() => toggleChecklistItem(item.key)}
                  />
                  <span>{t(item.labelKey)}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>

        <section className="card menu-card">
          <div className="menu-info">
            <Icon name="help" size={20} />
            <div>
              <strong>{t('supportTitle')}</strong>
              <p className="muted">{t('supportBody')}</p>
            </div>
          </div>
        </section>

        <section className="card menu-card">
          <div className="menu-info">
            <Icon name="box" size={20} />
            <div>
              <strong>{t('aboutTitle')}</strong>
              <p className="muted">{t('aboutBody')}</p>
            </div>
          </div>
        </section>

        <button type="button" className="btn btn-outline btn-block" onClick={signOut}>
          {t('signOut')}
        </button>
      </main>
    </div>
  );
}
