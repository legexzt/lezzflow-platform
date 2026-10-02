import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import api from '../api.js'
import Icon from './Icon.jsx'
import { useLang } from '../LanguageContext.jsx'

export default function BottomNav() {
  const location = useLocation()
  const { t } = useLang()
  const [placedCount, setPlacedCount] = useState(0)

  const items = [
    { to: '/', end: true, label: t('nav_home'), icon: 'home' },
    { to: '/orders', end: false, label: t('nav_orders'), icon: 'receipt' },
    { to: '/scan', end: false, label: 'Scan', icon: 'scan' },
    { to: '/products', end: false, label: t('nav_products'), icon: 'box' },
    { to: '/money', end: false, label: t('nav_money'), icon: 'money' },
    { to: '/more', end: false, label: t('nav_more'), icon: 'settings' },
  ]

  useEffect(() => {
    let active = true
    async function loadBadge() {
      try {
        const res = await api.get('/orders')
        const list = Array.isArray(res.data) ? res.data : res.data?.orders || []
        const count = list.filter((o) => o?.status === 'placed').length
        if (active) {
          setPlacedCount(count)
        }
      } catch (_) {
        if (active) {
          setPlacedCount(0)
        }
      }
    }
    loadBadge()
    return () => {
      active = false
    }
  }, [location])

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
            <div className="nav-icon-wrap">
              <Icon name={item.icon} size={22} />
              {item.to === '/orders' && placedCount > 0 && (
                <span className="nav-badge">{placedCount}</span>
              )}
            </div>
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

