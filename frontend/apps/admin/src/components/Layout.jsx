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
];

export default function Layout({ children }) {
  const { backendUser, firebaseUser, logout } = useAuth();
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
            <span className="sidebar-user-role">Administrator</span>
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
