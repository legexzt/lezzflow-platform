import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon';
import { useAvailableCount } from '../AvailableCountContext';
import { useLang } from '../i18n.jsx';

/**
 * Bottom navigation — Deliveries / Earnings / Refer are deep-linked tabs on
 * the Dashboard (?tab=), everything secondary lives under More.
 */
export default function BottomNav() {
  const { t } = useLang();
  const navigate = useNavigate();
  const { search, pathname } = useLocation();
  const { count } = useAvailableCount();
  const tab = new URLSearchParams(search).get('tab') || 'deliveries';

  const items = [
    { tab: 'deliveries', label: t('tabDeliveries'), icon: 'box', badge: count },
    { tab: 'earnings', label: t('tabEarnings'), icon: 'money' },
    { tab: 'refer', label: t('tabRefer'), icon: 'userPlus' },
  ];

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {items.map((item) => (
        <button
          key={item.tab}
          type="button"
          className={`bottom-nav-item${pathname === '/' && tab === item.tab ? ' active' : ''}`}
          onClick={() => navigate(`/?tab=${item.tab}`)}
        >
          <span className="bottom-nav-icon">
            <Icon name={item.icon} size={22} />
            {item.badge > 0 && <span className="bottom-nav-badge">{item.badge}</span>}
          </span>
          <span className="bottom-nav-label">{item.label}</span>
        </button>
      ))}
      <NavLink
        to="/more"
        className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}
      >
        <Icon name="settings" size={22} />
        <span className="bottom-nav-label">{t('tabMore')}</span>
      </NavLink>
    </nav>
  );
}
