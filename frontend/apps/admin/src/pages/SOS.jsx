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

  // Cycle-3: travel disputes ("I already travelled")
  const [disputes, setDisputes] = useState([]);
  const [disputeFilter, setDisputeFilter] = useState('open');
  const [disputesLoading, setDisputesLoading] = useState(true);
  const [disputesError, setDisputesError] = useState(null);
  const [resolvingId, setResolvingId] = useState(null);
  const [goodwill, setGoodwill] = useState({});

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

  const loadDisputes = useCallback(async () => {
    setDisputesError(null);
    setDisputesLoading(true);
    try {
      const res = await api.get('/delivery/disputes', { params: { status: disputeFilter } });
      const data = res.data;
      setDisputes(Array.isArray(data) ? data : data?.disputes ?? []);
    } catch (err) {
      setDisputesError(errMsg(err, 'Could not load travel disputes.'));
    } finally {
      setDisputesLoading(false);
    }
  }, [disputeFilter]);

  useEffect(() => {
    loadDisputes();
  }, [loadDisputes]);

  const handleResolveDispute = async (dispute, status) => {
    setResolvingId(dispute.id);
    setNotice(null);
    try {
      const payload = { status };
      const gw = goodwill[dispute.id];
      if (status === 'approved' && gw !== undefined && gw !== '') {
        payload.goodwill_amount = Number(gw);
      }
      const res = await api.patch(`/delivery/disputes/${dispute.id}`, payload);
      const updated = res.data ?? { ...dispute, status };
      setDisputes((prev) =>
        disputeFilter === 'open' ? prev.filter((d) => d.id !== dispute.id) : prev.map((d) => (d.id === dispute.id ? updated : d)),
      );
      setNotice({ type: 'success', text: `Dispute ${status}.` });
    } catch (err) {
      setNotice({ type: 'error', text: errMsg(err, 'Could not resolve dispute.') });
    } finally {
      setResolvingId(null);
    }
  };

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

      {/* Cycle-3: travel disputes */}
      <header className="page-header" style={{ marginTop: 32 }}>
        <h1>Travel Disputes</h1>
        <p>“I already travelled” — partners disputing trips cancelled by the customer/shop</p>
      </header>

      <div className="kyc-actions" style={{ marginBottom: 12 }}>
        {['open', 'approved', 'rejected'].map((s) => (
          <button
            key={s}
            type="button"
            className={disputeFilter === s ? 'btn btn-primary' : 'btn btn-outline'}
            onClick={() => setDisputeFilter(s)}
          >
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {disputesLoading ? (
        <Loading message="Loading disputes…" />
      ) : disputesError ? (
        <ErrorState message={disputesError} onRetry={loadDisputes} />
      ) : disputes.length === 0 ? (
        <EmptyState message={`No ${disputeFilter} disputes.`} />
      ) : (
        <div className="kyc-list">
          {disputes.map((d) => {
            const busy = resolvingId === d.id;
            return (
              <div className="kyc-card" key={d.id}>
                <div className="kyc-head">
                  <h3>{d.partner_name || 'Unknown partner'}</h3>
                  <p>
                    {formatDateTime(d.created_at)}
                    {' · '}
                    {timeAgo(d.created_at)}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                  <span style={{ fontSize: 14 }}>
                    Order #{d.order_id} · cancelled by {d.cancelled_by === 'order' ? 'customer/shop' : d.cancelled_by}
                  </span>
                  {d.note && (
                    <span style={{ fontSize: 14 }}>
                      <strong>Partner note:</strong> {d.note}
                    </span>
                  )}
                  {d.status !== 'open' && (
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                      {d.status}
                      {d.goodwill_amount ? ` · goodwill ₹${Number(d.goodwill_amount).toFixed(2)}` : ''}
                    </span>
                  )}
                </div>
                {!isOpsViewer && d.status === 'open' && (
                  <div className="kyc-actions">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="Goodwill ₹ (optional)"
                      value={goodwill[d.id] ?? ''}
                      onChange={(e) => setGoodwill((prev) => ({ ...prev, [d.id]: e.target.value }))}
                      style={{ width: 170 }}
                      disabled={busy}
                    />
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={busy}
                      onClick={() => handleResolveDispute(d, 'approved')}
                    >
                      {busy ? 'Working…' : 'Approve'}
                    </button>
                    <button
                      className="btn btn-outline"
                      type="button"
                      disabled={busy}
                      onClick={() => handleResolveDispute(d, 'rejected')}
                    >
                      {busy ? 'Working…' : 'Reject'}
                    </button>
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
