import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { Loading, ErrorState, EmptyState } from '../components/States.jsx';
import { errMsg, formatDate } from '../utils.js';

const TEMPLATES = {
  scheme: {
    label: 'Scheme launch',
    type: 'scheme_offer',
    title: 'New Sarkari Yojana for shopkeepers!',
    body: 'A new government scheme can help your business. Open the Mart app to check eligibility and apply.',
  },
  offer: {
    label: 'Offer drop',
    type: 'promo',
    title: 'This week only: special discounts near you',
    body: 'Shops near you have added new offers. Open LezzFlow Mart to see what is live in your area.',
  },
  order: {
    label: 'Order update',
    type: 'order_update',
    title: 'Your order is on its way',
    body: 'Your LezzFlow order has been packed and handed to the delivery partner.',
  },
};

export default function Broadcasts() {
  const { isOpsViewer } = useAuth();
  const [searchParams] = useSearchParams();
  const [count, setCount] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState('system');
  const [userId, setUserId] = useState('');
  const [sending, setSending] = useState(false);
  const [sentMsg, setSentMsg] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, a] = await Promise.all([
        api.get('/admin/notifications/broadcast-count'),
        api.get('/admin/notifications/analytics'),
      ]);
      setCount(c.data);
      setAnalytics(a.data);
    } catch (err) {
      setError(errMsg(err, 'Could not load broadcast data.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Prefill from the Schemes page ("Feature in broadcast")
  useEffect(() => {
    const schemeTitle = searchParams.get('schemeTitle');
    if (schemeTitle) {
      const t = TEMPLATES.scheme;
      setTitle(`${schemeTitle} — check now`);
      setBody(t.body);
      setType(t.type);
    }
  }, [searchParams]);

  const applyTemplate = (key) => {
    const t = TEMPLATES[key];
    setTitle(t.title);
    setBody(t.body);
    setType(t.type);
  };

  const send = async () => {
    if (!title.trim()) {
      setSentMsg({ ok: false, text: 'Title is required.' });
      return;
    }
    setSending(true);
    setSentMsg(null);
    try {
      const payload = { title: title.trim(), body: body.trim() || null, type };
      if (userId.trim()) payload.user_id = Number(userId.trim());
      await api.post('/admin/notifications', payload);
      setSentMsg({ ok: true, text: 'Notification sent.' });
      setTitle('');
      setBody('');
      setUserId('');
      await load();
    } catch (err) {
      const msg =
        err?.response?.status === 429
          ? 'Weekly broadcast limit reached (2/week). No message was sent.'
          : errMsg(err, 'Could not send notification.');
      setSentMsg({ ok: false, text: msg });
    } finally {
      setSending(false);
    }
  };

  const limitReached = count && count.remaining <= 0;

  return (
    <div className="page">
      <header className="page-header">
        <h1>Broadcasts</h1>
        <p>Compose notifications — max 2 broadcasts per week (GTM retention ritual)</p>
      </header>

      {loading ? (
        <Loading message="Loading broadcasts…" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <>
          <section className="card" style={{ marginBottom: 24 }}>
            <h2 style={{ marginTop: 0 }}>
              Weekly guardrail:{' '}
              <span className={limitReached ? 'badge badge-red' : 'badge badge-green'}>
                {count.used}/{count.limit} used
              </span>
            </h2>
            <p className="muted">Week starting {count.week_start}. Targeted (single-user) messages are not counted.</p>

            {isOpsViewer ? (
              <p className="muted">Read-only access — you cannot send broadcasts.</p>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  {Object.entries(TEMPLATES).map(([key, t]) => (
                    <button key={key} className="btn btn-outline btn-sm" type="button" onClick={() => applyTemplate(key)}>
                      {t.label} template
                    </button>
                  ))}
                </div>
                <div style={{ display: 'grid', gap: 10, maxWidth: 640 }}>
                  <input
                    className="input"
                    placeholder="Title (required)"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Body — keep it short and useful"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
                      <option value="system">system</option>
                      <option value="scheme_offer">scheme_offer (Sarkari Yojana)</option>
                      <option value="promo">promo</option>
                      <option value="order_update">order_update</option>
                    </select>
                    <input
                      className="input"
                      placeholder="User ID (empty = broadcast to all)"
                      value={userId}
                      onChange={(e) => setUserId(e.target.value)}
                      style={{ maxWidth: 260 }}
                    />
                  </div>
                  {title.trim() && (
                    <div className="card" style={{ background: 'var(--bg-soft)' }}>
                      <strong>Preview</strong>
                      <div style={{ marginTop: 6 }}>
                        <div><strong>{title}</strong></div>
                        {body.trim() && <div className="muted">{body}</div>}
                        <div className="muted" style={{ marginTop: 4 }}>
                          Type: {type} · Audience: {userId.trim() ? `user #${userId.trim()}` : 'broadcast (all users)'}
                        </div>
                      </div>
                    </div>
                  )}
                  <div>
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={sending || (limitReached && !userId.trim())}
                      onClick={send}
                      title={limitReached && !userId.trim() ? 'Weekly broadcast limit reached' : undefined}
                    >
                      {sending ? 'Sending…' : 'Send notification'}
                    </button>
                  </div>
                  {sentMsg && (
                    <p className={sentMsg.ok ? '' : 'state-error-text'}>{sentMsg.text}</p>
                  )}
                </div>
              </>
            )}
          </section>

          <section>
            <h2>Read-rate analytics</h2>
            {analytics.summary.length === 0 ? (
              <EmptyState message="No notifications sent yet — read rates will appear here." />
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  {analytics.summary.map((s) => (
                    <span key={s.type} className="badge badge-blue">
                      {s.type}: {s.read}/{s.sent} read ({s.read_rate}%)
                    </span>
                  ))}
                </div>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Type</th>
                        <th>Audience</th>
                        <th>Read</th>
                        <th>Sent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.items.map((n) => (
                        <tr key={n.id}>
                          <td><strong>{n.title}</strong></td>
                          <td>{n.type}</td>
                          <td>{n.audience}</td>
                          <td>{n.is_read ? 'Yes' : '—'}</td>
                          <td className="muted">{formatDate(n.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
