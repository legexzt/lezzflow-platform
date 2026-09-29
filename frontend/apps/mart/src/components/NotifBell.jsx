import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api.js';
import Icon from './Icon.jsx';

/**
 * Notification bell with unread badge for the header.
 * Broadcasts + personal notifications come from /api/v1/notifications (auth).
 * Non-fatal: hides the badge on error.
 */
export default function NotifBell() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let active = true;
    let timer = null;
    async function load() {
      try {
        const res = await api.get('/api/v1/notifications', { params: { limit: 20 } });
        const list = Array.isArray(res.data) ? res.data : res.data?.notifications || [];
        if (active) setUnread(list.filter((n) => !n.is_read).length);
      } catch {
        // Non-fatal — bell just shows no badge
      }
    }
    load();
    timer = setInterval(load, 60000);
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, []);

  return (
    <Link to="/notifications" className="notif-bell" aria-label="Notifications">
      <Icon name="bell" size={20} />
      {unread > 0 && <span className="cart-badge notif-badge">{unread > 9 ? '9+' : unread}</span>}
    </Link>
  );
}
