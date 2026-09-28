import { useEffect, useState, useCallback } from 'react';
import api from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import Icon from '../components/Icon.jsx';
import { Loading, ErrorState, EmptyState } from '../components/States.jsx';
import { errMsg, formatDateTime } from '../utils.js';

function timeAgo(dateStr) {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)} h ago`;
}

function sosBadge(status) {
  if (status === 'open') return 'badge badge-amber';
  if (status === 'acknowledged') return 'badge badge-blue';
  if (status === 'resolved') return 'badge badge-grey';
  return 'badge badge-grey';
}

export default function SOS() {
  const { isOpsViewer } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionId, setActionId] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get('/admin/sos-alerts');
      const data = res.data;
      setAlerts(Array.isArray(data) ? data : data?.alerts ?? data?.data ?? []);
    } catch (err) {
      setError(errMsg(err, 'Could not load SOS alerts.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const handleAction = async (alert, status) => {
    setActionId(alert.id);
    setNotice(null);
    try {
      const res = await api.patch(`/admin/sos-alerts/${alert.id}`, { status });
      const updated = res.data?.alert ?? res.data ?? { ...alert, status };
      setAlerts((prev) => prev.map((a) => (a.id === alert.id ? updated : a)));
      setNotice({ type: 'success', text: `Alert ${status}.` });
    } catch (err) {
      setNotice({ type: 'error', text: errMsg(err, 'Action failed. Please try again.') });
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>SOS Alerts</h1>
        <p>Active distress signals from delivery partners — auto-refreshes every 30 seconds</p>
      </header>

      {notice && (
        <div
          className={notice.type === 'success' ? 'alert alert-success' : 'alert alert-error'}
          style={{ marginBottom: 16 }}
        >
          {notice.text}
        </div>
      )}

      {loading ? (
        <Loading message="Loading SOS alerts…" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : alerts.length === 0 ? (
        <EmptyState message="No open SOS alerts." />
      ) : (
        <div className="kyc-list">
          {alerts.map((alert) => {
            const busy = actionId === alert.id;
            const ageMs = Date.now() - new Date(alert.created_at).getTime();
            const ageMinutes = ageMs / 60000;
            const slaOverdue = alert.status === 'open' && ageMinutes > 5;

            return (
              <div className="kyc-card" key={alert.id}>
                <div className="kyc-head">
                  <h3>{alert.partner_name || 'Unknown partner'}</h3>
                  <p>
                    {formatDateTime(alert.created_at)}
                    {' · '}
                    {timeAgo(alert.created_at)}
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                  {alert.lat != null && alert.lng != null && (
                    <span style={{ fontSize: 14, color: 'var(--muted)' }}>
                      <Icon name="location" size={14} />
                      {' '}
                      {alert.lat}, {alert.lng}
                    </span>
                  )}
                  {alert.note && (
                    <span style={{ fontSize: 14 }}>
                      <strong>Note:</strong> {alert.note}
                    </span>
                  )}
                  {alert.delivery_request_id && (
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                      Delivery request: {alert.delivery_request_id}
                    </span>
                  )}
                </div>

                <span className={sosBadge(alert.status)} style={{ alignSelf: 'flex-start', marginBottom: 8 }}>
                  {alert.status}
                </span>

                {slaOverdue && (
                  <div className="alert alert-error" style={{ padding: '6px 12px', fontSize: 13, marginBottom: 8 }}>
                    <Icon name="warning" size={14} />
                    {' '}
                    Acknowledge within 5 min — SLA overdue
                  </div>
                )}

                {!isOpsViewer && (
                  <div className="kyc-actions">
                    {alert.status === 'open' && (
                      <button
                        className="btn btn-primary"
                        type="button"
                        disabled={busy}
                        onClick={() => handleAction(alert, 'acknowledged')}
                      >
                        {busy ? 'Working…' : 'Acknowledge'}
                      </button>
                    )}
                    {(alert.status === 'open' || alert.status === 'acknowledged') && (
                      <button
                        className="btn btn-outline"
                        type="button"
                        disabled={busy}
                        onClick={() => handleAction(alert, 'resolved')}
                      >
                        {busy ? 'Working…' : 'Resolve'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
