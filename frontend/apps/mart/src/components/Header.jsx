import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { useCart } from '../CartContext.jsx';
import NotifBell from './NotifBell.jsx';

export default function Header() {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="app-header">
      <div className="header-inner">
        <Link to="/" className="brand">
          <img
            src="/lezzflow-horizontal-dark.png"
            alt="LezzFlow"
            className="brand-logo"
          />
          <span className="brand-app">Mart</span>
        </Link>
        <nav className="nav">
          <NavLink to="/" end className="nav-link">
            Home
          </NavLink>
          <NavLink to="/orders" className="nav-link">
            My Orders
          </NavLink>
          <NavLink to="/cart" className="nav-link cart-link">
            Cart
            {count > 0 && <span className="cart-badge">{count}</span>}
          </NavLink>
          <NotifBell />
          {user && (
            <button type="button" className="btn btn-outline btn-sm" onClick={handleLogout}>
              Logout
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
