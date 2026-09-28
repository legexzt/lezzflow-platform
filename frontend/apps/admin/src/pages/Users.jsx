import { Fragment, useEffect, useState } from 'react';
import api from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { Loading, ErrorState, EmptyState } from '../components/States.jsx';
import {
  asArray,
  errMsg,
  formatDate,
  formatDateTime,
  roleBadge,
  prettify,
  REJECT_REASON_LABELS,
} from '../utils.js';

const ROLES = ['customer', 'seller', 'partner', 'admin'];

const ACTION_LABELS = {
  kyc_approve: 'KYC approved',
  kyc_reject: 'KYC rejected',
  kyc_reupload_requested: 'Re-upload requested',
  order_nudge: 'Order nudge sent',
  ops_viewer_granted: 'Ops viewer granted',
  ops_viewer_revoked: 'Ops viewer revoked',
};

function formatAction(action) {
  return ACTION_LABELS[action] || prettify(action);
}

function renderAuditDetails(details) {
  if (!details) return null;
  const parts = [];
  const reason = details.reason_code;
  if (reason) {
    const reasonLabel = REJECT_REASON_LABELS[reason] || reason;
    parts.push(`Reason: ${reasonLabel}`);
  }
  const note = details.note || details.reject_note;
  if (note) {
    parts.push(`Note: ${note}`);
  }
  if (details.target) {
    parts.push(`Target: ${details.target}`);
  }
  if (parts.length === 0) return null;
  return parts.join(' · ');
}

export default function Users() {
  const { isOpsViewer } = useAuth();
  const [role, setRole] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  // Audit history state
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);

  const load = async (r) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/admin/users', { params: r ? { role: r } : {} });
      setUsers(asArray(res.data, ['users']));
    } catch (err) {
      setError(errMsg(err, 'Could not load users.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load('');
  }, []);

  const onFilter = (e) => {
    const r = e.target.value;
    setRole(r);
    load(r);
  };

  const toggleHistory = async (userId, userRole) => {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
      setHistory([]);
      return;
    }

    setExpandedUserId(userId);
    setHistoryLoading(true);
    setHistoryError(null);
    setHistory([]);

    try {
      if (userRole === 'partner') {
        const [userAuditRes, kycAuditRes] = await Promise.all([
          api.get('/admin/audit', { params: { entity_type: 'user', entity_id: userId } }),
          api.get('/admin/audit', { params: { entity_type: 'kyc', limit: 100 } }),
        ]);

        const userRows = asArray(userAuditRes.data, ['data', 'audit']);
        const kycRows = asArray(kycAuditRes.data, ['data', 'audit']).filter(
          (row) => row.details && String(row.details.partner_id) === String(userId)
        );

        const merged = [...userRows, ...kycRows].sort((a, b) => {
          const ta = new Date(a.created_at || a.createdAt).getTime() || 0;
          const tb = new Date(b.created_at || b.createdAt).getTime() || 0;
          return tb - ta;
        });

        setHistory(merged);
      } else {
        const res = await api.get('/admin/audit', {
          params: { entity_type: 'user', entity_id: userId },
        });
        setHistory(asArray(res.data, ['data', 'audit']));
      }
    } catch (err) {
      setHistoryError(errMsg(err, 'Could not load audit history.'));
    } finally {
      setHistoryLoading(false);
    }
  };

  const toggleOpsViewer = async (firebaseUid, grant) => {
    setNotice(null);
    try {
      if (grant) {
        await api.post('/admin/ops-viewers', { firebase_uid: firebaseUid });
      } else {
        await api.delete(`/admin/ops-viewers/${firebaseUid}`);
      }
      setNotice({
        type: 'success',
        text: 'Viewer access updated — takes effect on their next sign-in (token refresh).',
      });
    } catch (err) {
      setNotice({
        type: 'error',
        text: errMsg(err, 'Failed to update viewer access.'),
      });
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Users</h1>
        <p>Customers, sellers, delivery partners and admins</p>
      </header>

      {notice && (
        <div
          className={notice.type === 'success' ? 'alert alert-success' : 'alert alert-error'}
          style={{ marginBottom: 16 }}
        >
          {notice.text}
        </div>
      )}

      <div className="filters">
        <select className="filter-select" value={role} onChange={onFilter}>
          <option value="">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r.charAt(0).toUpperCase() + r.slice(1)}s
            </option>
          ))}
        </select>
        {!loading && !error && (
          <span className="results-count">
            {users.length} {users.length === 1 ? 'user' : 'users'}
          </span>
        )}
      </div>

      {loading ? (
        <Loading message="Loading users…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => load(role)} />
      ) : users.length === 0 ? (
        <EmptyState message={role ? `No users with role “${role}”.` : 'No users yet.'} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => {
                const userId = u.id || u._id || u.uid || i;
                const isExpanded = expandedUserId === userId;

                return (
                  <Fragment key={userId}>
                    <tr>
                      <td>
                        <div className="cell-title">{u.name || u.displayName || '—'}</div>
                      </td>
                      <td>{u.email || '—'}</td>
                      <td>{u.phone || u.phone_number || u.phoneNumber || '—'}</td>
                      <td>{u.role ? <span className={roleBadge(u.role)}>{u.role}</span> : '—'}</td>
                      <td>{formatDate(u.created_at || u.createdAt)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-sm btn-outline"
                            type="button"
                            onClick={() => toggleHistory(userId, u.role)}
                          >
                            {isExpanded ? 'Hide' : 'History'}
                          </button>
                          {!isOpsViewer && u.role === 'admin' && (
                            <>
                              <button
                                className="btn btn-sm btn-outline"
                                type="button"
                                onClick={() => toggleOpsViewer(u.firebase_uid, true)}
                              >
                                Make ops viewer
                              </button>
                              <button
                                className="btn btn-sm btn-outline"
                                type="button"
                                onClick={() => toggleOpsViewer(u.firebase_uid, false)}
                              >
                                Remove viewer
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={6} style={{ padding: '12px 16px', background: '#f8fafc' }}>
                          <div className="history-panel">
                            <h4
                              style={{
                                margin: '0 0 8px',
                                fontSize: 13,
                                color: 'var(--muted)',
                              }}
                            >
                              Audit History for {u.name || 'User'}
                            </h4>
                            {historyLoading ? (
                              <Loading message="Loading history…" />
                            ) : historyError ? (
                              <p className="alert alert-error" style={{ margin: 0 }}>
                                {historyError}
                              </p>
                            ) : history.length === 0 ? (
                              <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
                                No recorded admin actions yet.
                              </p>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {history.map((entry) => (
                                  <div className="history-entry" key={entry.id}>
                                    <span className="history-time">
                                      {formatDateTime(entry.created_at)}
                                    </span>
                                    <span className="history-actor">
                                      {entry.actor_name || 'Unknown admin'}
                                    </span>
                                    <span className="history-action">
                                      {formatAction(entry.action)}
                                    </span>
                                    {renderAuditDetails(entry.details) && (
                                      <span className="history-detail">
                                        {renderAuditDetails(entry.details)}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
