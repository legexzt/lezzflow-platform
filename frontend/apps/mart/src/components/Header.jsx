import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import NotifBell from './NotifBell.jsx';
import Icon from './Icon.jsx';

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // The drawer never survives a navigation — every row tap routes away.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    setDrawerOpen(false);
    await logout();
    navigate('/login');
  };

  return (
    <header className="app-header">
      <div className="header-inner">
        {user ? (
          <button
            type="button"
            className="icon-btn header-menu-btn"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            <Icon name="menu" size={22} />
          </button>
        ) : (
          <span className="header-spacer" aria-hidden="true" />
        )}

        <Link to={user ? '/' : '/login'} className="brand">
          <img
            src="/brand-banner.png"
            alt="LezzFlow"
            className="brand-logo"
            style={{ height: '38px', width: 'auto' }}
          />
          <span className="brand-app">Mart</span>
        </Link>

        {user ? (
          <NotifBell />
        ) : (
          <Link to="/login" className="btn btn-outline btn-sm">
            Sign in
          </Link>
        )}
      </div>

      {user && drawerOpen && (
        <>
          <div
            className="drawer-overlay"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside className="drawer" aria-label="Menu">
            <nav>
              <Link to="/orders" className="drawer-row">
                <Icon name="receipt" size={20} />
                My Orders
              </Link>
              <Link to="/cart" className="drawer-row">
                <Icon name="cart" size={20} />
                Cart
              </Link>
              <Link to="/nearby" className="drawer-row">
                <Icon name="map" size={20} />
                Nearby Shops
              </Link>
              <Link to="/more" className="drawer-row">
                <Icon name="settings" size={20} />
                Settings
              </Link>
              <button type="button" className="drawer-row" onClick={handleLogout}>
                <Icon name="lock" size={20} />
                Logout
              </button>
            </nav>
          </aside>
        </>
      )}
    </header>
  );
}
