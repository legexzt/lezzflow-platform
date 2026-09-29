import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import Icon from '../components/Icon.jsx';

/**
 * More page — secondary features behind the clean bottom nav.
 * Home stays focused on shop discovery.
 */
export default function More() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="page">
      <h1 className="page-title">More</h1>

      <div className="menu-card">
        <Link to="/notifications" className="menu-row">
          <Icon name="bell" size={20} />
          <span>Notifications</span>
        </Link>
        <Link to="/orders" className="menu-row">
          <Icon name="receipt" size={20} />
          <span>My Orders</span>
        </Link>
      </div>

      <div className="menu-card">
        <div className="menu-info">
          <Icon name="help" size={20} />
          <div>
            <strong>Customer support</strong>
            <p className="muted small">Need help with an order? Write to us at support@legezt.in</p>
          </div>
        </div>
      </div>

      <div className="menu-card">
        <div className="menu-info">
          <Icon name="users" size={20} />
          <div>
            <strong>About</strong>
            <p className="muted small">
              LezzFlow Mart — fresh groceries from your neighbourhood kirana, delivered fast.
            </p>
            {user?.email && <p className="muted tiny">Signed in as {user.email}</p>}
          </div>
        </div>
      </div>

      <button type="button" className="btn btn-outline btn-block" onClick={handleLogout}>
        Logout
      </button>
    </div>
  );
}
