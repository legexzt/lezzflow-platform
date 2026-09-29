import { useCallback, useEffect, useState } from 'react';
import api from '../api.js';
import Icon from '../components/Icon.jsx';

function toList(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.notifications)) return data.notifications;
  return [];
}

/**
 * Notification inbox — the receiving end of the broadcast retention ritual.
 * Real rows only (/api/v1/notifications); read state is per-user.
 */
export default function Notifications() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/v1/notifications', { params: { limit: 50 } });
      setItems(toList(res.data));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markRead(n) {
    if (n.is_read) return;
    try {
      await api.patch(`/api/v1/notifications/${n.id}/read`);
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    } catch {
      // Non-fatal
    }
  }

  async function markAllRead() {
    setMarkingAll(true);
    try {
      await api.post('/api/v1/notifications/read-all');
      setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
    } finally {
      setMarkingAll(false);
    }
  }

  if (loading) {
    return (
      <div className="center-screen">
        <div className="spinner" />
        <p>Loading…</p>
      </div>
    );
  }

  const unreadCount = items.filter((n) => !n.is_read).length;

  return (
    <div className="page">
      <div className="page-head-row">
        <h1 className="page-title">Notifications</h1>
        {unreadCount > 0 && (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={markAllRead}
            disabled={markingAll}
          >
            Mark all read
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          <Icon name="bell" size={32} />
          <p>No notifications yet.</p>
        </div>
      ) : (
        <div className="notif-list">
          {items.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`notif-item${n.is_read ? ' read' : ' unread'}`}
              onClick={() => markRead(n)}
            >
              <div className="notif-item-head">
                <strong>{n.title}</strong>
                {!n.is_read && <span className="dot-unread" aria-label="Unread" />}
              </div>
              {n.body && <p className="muted">{n.body}</p>}
              <span className="tiny muted">
                {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                {!n.user_id ? ' · Broadcast' : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
