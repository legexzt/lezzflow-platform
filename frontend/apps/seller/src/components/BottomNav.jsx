import { NavLink } from 'react-router-dom'
import Icon from './Icon.jsx'

const items = [
  { to: '/', end: true, label: 'Home', icon: 'home' },
  { to: '/products', end: false, label: 'Products', icon: 'box' },
  { to: '/orders', end: false, label: 'Orders', icon: 'receipt' },
  { to: '/advisory', end: false, label: 'Advisory', icon: 'chart' },
  { to: '/settings', end: false, label: 'Settings', icon: 'settings' },
]

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-inner">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon name={item.icon} size={22} />
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
