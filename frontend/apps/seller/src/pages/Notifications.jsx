import { useCallback, useEffect, useState } from 'react'
import api, { getErrorMessage } from '../api.js'
import { useToast } from '../components/Toast.jsx'
import Loading from '../components/Loading.jsx'
import Icon from '../components/Icon.jsx'
import { useLang } from '../LanguageContext.jsx'

function toList(data) {
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.notifications)) return data.notifications
  return []
}

/**
 * Notification inbox — the receiving end of the broadcast retention ritual.
 * Real rows only (GET /v1/notifications); read state is per-user.
 */
export default function Notifications() {
  const { t } = useLang()
  const toast = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [markingAll, setMarkingAll] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/v1/notifications', { params: { limit: 50 } })
      setItems(toList(res.data))
    } catch (err) {
      toast(getErrorMessage(err, t('notif_load_failed')), 'error')
    } finally {
      setLoading(false)
    }
  }, [toast, t])

  useEffect(() => {
    load()
  }, [load])

  async function markRead(n) {
    if (n.is_read) return
    try {
      await api.patch(`/v1/notifications/${n.id}/read`)
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)))
    } catch (_) {
      // Non-fatal
    }
  }

  async function markAllRead() {
    setMarkingAll(true)
    try {
      await api.post('/v1/notifications/read-all')
      setItems((prev) => prev.map((x) => ({ ...x, is_read: true })))
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setMarkingAll(false)
    }
  }

  if (loading) return <Loading />

  const unreadCount = items.filter((n) => !n.is_read).length

  return (
    <div className="page">
      <div className="page-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="page-title">{t('notif_title')}</h1>
        {unreadCount > 0 && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={markAllRead}
            disabled={markingAll}
          >
            {t('notif_mark_all')}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="card empty-card">
          <Icon name="bell" size={28} />
          <p className="muted">{t('notif_empty')}</p>
        </div>
      ) : (
        <div className="notif-list">
          {items.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`card notif-item ${n.is_read ? 'read' : 'unread'}`}
              onClick={() => markRead(n)}
            >
              <div className="notif-item-head">
                <strong>{n.title}</strong>
                {!n.is_read && <span className="dot-unread" aria-label="Unread" />}
              </div>
              {n.body && <p className="muted small">{n.body}</p>}
              <span className="muted tiny">
                {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                {n.user_id ? '' : ` · ${t('notif_broadcast')}`}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
