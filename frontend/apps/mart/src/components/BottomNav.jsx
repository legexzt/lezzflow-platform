import { NavLink } from 'react-router-dom';
import { useCart } from '../CartContext.jsx';
import Icon from './Icon.jsx';

/**
 * Mobile bottom navigation — Home keeps the shop discovery front and center,
 * secondary features live under More. Desktop keeps using the header nav.
 */
export default function BottomNav() {
  const { count } = useCart();

  const items = [
    { to: '/', label: 'Home', icon: 'home', end: true },
    { to: '/orders', label: 'Orders', icon: 'receipt' },
    { to: '/cart', label: 'Cart', icon: 'cart', badge: count },
    { to: '/more', label: 'More', icon: 'settings' },
  ];

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}
        >
          <span className="bottom-nav-icon">
            <Icon name={item.icon} size={22} />
            {item.badge > 0 && <span className="bottom-nav-badge">{item.badge}</span>}
          </span>
          <span className="bottom-nav-label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
