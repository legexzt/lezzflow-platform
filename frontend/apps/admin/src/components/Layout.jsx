import { NavLink } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import Icon from './Icon.jsx';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: 'chart', end: true },
  { to: '/shops', label: 'Shops', icon: 'home' },
  { to: '/orders', label: 'Orders', icon: 'box' },
  { to: '/users', label: 'Users', icon: 'users' },
  { to: '/products', label: 'Products', icon: 'cart' },
  { to: '/kyc', label: 'KYC Review', icon: 'idcard' },
  { to: '/analytics', label: 'Locality analytics', icon: 'location' },
  { to: '/sos', label: 'SOS Alerts', icon: 'warning' },
  { to: '/audit', label: 'Audit Log', icon: 'receipt' },
  { to: '/funnel', label: 'Onboarding Funnel', icon: 'chart' },
  { to: '/offers', label: 'Offers', icon: 'bag' },
  { to: '/referrals', label: 'Referrals', icon: 'users' },
  { to: '/schemes', label: 'Schemes', icon: 'bank' },
  { to: '/notifications', label: 'Broadcasts', icon: 'megaphone' },
  { to: '/shop-health', label: 'Shop Health', icon: 'home' },
  { to: '/ai-ops', label: 'AI Ops', icon: 'scan' },
];

export default function Layout({ children }) {
  const { backendUser, firebaseUser, isOpsViewer, logout } = useAuth();
  const displayName =
    backendUser?.name || firebaseUser?.displayName || firebaseUser?.email || 'Admin';

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/lezzflow-horizontal-dark.png" alt="LezzFlow" className="sidebar-logo" />
          <span className="sidebar-tag">Admin</span>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              <span className="nav-icon"><Icon name={item.icon} size={20} /></span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span className="sidebar-user-name">{displayName}</span>
            {isOpsViewer ? (
              <span className="badge badge-amber" style={{ alignSelf: 'flex-start' }}>
                Ops viewer · read-only
              </span>
            ) : (
              <span className="sidebar-user-role">Administrator</span>
            )}
          </div>
          <button className="btn btn-outline btn-block" onClick={logout} type="button">
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
