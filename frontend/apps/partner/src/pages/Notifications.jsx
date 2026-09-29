import { useCallback, useEffect, useState } from 'react';
import Header from '../components/Header';
import Icon from '../components/Icon';
import { useLang } from '../i18n.jsx';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../api';

/**
 * Notification inbox — the receiving end of the broadcast retention ritual.
 * Real rows only; read state is per-user.
 */
export default function Notifications() {
  const { t } = useLang();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchNotifications(50));
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
      await markNotificationRead(n.id);
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    } catch {
      // Non-fatal
    }
  }

  async function markAllRead() {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
    } finally {
      setMarkingAll(false);
    }
  }

  const unreadCount = items.filter((n) => !n.is_read).length;

  return (
    <div className="page">
      <Header />
      <main className="container">
        <div className="page-head-row">
          <h1 className="page-title">{t('notifTitle')}</h1>
          {unreadCount > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={markAllRead}
              disabled={markingAll}
            >
              {t('notifMarkAll')}
            </button>
          )}
        </div>

        {loading ? (
          <div className="screen-center">
            <div className="spinner" aria-label="Loading" />
          </div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <Icon name="bell" size={32} />
            <p>{t('notifEmpty')}</p>
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
                  {!n.user_id ? ` · ${t('notifBroadcast')}` : ''}
                </span>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
