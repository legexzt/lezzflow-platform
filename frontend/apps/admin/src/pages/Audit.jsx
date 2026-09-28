import { useEffect, useState } from 'react';
import api from '../api.js';
import { Loading, ErrorState, EmptyState } from '../components/States.jsx';
import { errMsg, formatDateTime } from '../utils.js';

export default function Audit() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [actionFilter, setActionFilter] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [limitValue, setLimitValue] = useState('50');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = {};
    if (actionFilter) params.action = actionFilter;
    if (entityTypeFilter) params.entity_type = entityTypeFilter;
    if (limitValue) params.limit = limitValue;

    api
      .get('/admin/audit', { params })
      .then((res) => {
        if (cancelled) return;
        const data = res.data;
        setEntries(Array.isArray(data) ? data : data?.entries ?? data?.data ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(errMsg(err, 'Could not load audit log.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [actionFilter, entityTypeFilter, limitValue]);

  function renderDetails(details) {
    if (!details || typeof details !== 'object' || Object.keys(details).length === 0) return '—';
    const str = JSON.stringify(details);
    return str.length > 80 ? str.slice(0, 80) + '…' : str;
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Audit Log</h1>
        <p>Read-only record of all admin actions</p>
      </header>

      <div className="filter-bar" style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="filter-input"
          type="text"
          placeholder="Filter by action…"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
        />
        <input
          className="filter-input"
          type="text"
          placeholder="Filter by entity type…"
          value={entityTypeFilter}
          onChange={(e) => setEntityTypeFilter(e.target.value)}
        />
        <select
          className="filter-input"
          value={limitValue}
          onChange={(e) => setLimitValue(e.target.value)}
        >
          <option value="25">25 rows</option>
          <option value="50">50 rows</option>
          <option value="100">100 rows</option>
        </select>
      </div>

      {loading ? (
        <Loading message="Loading audit log…" />
      ) : error ? (
        <ErrorState message={error} />
      ) : entries.length === 0 ? (
        <EmptyState message="No audit log entries matching the current filters." />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Actor</th>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Entity type</th>
                <th>Entity ID</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr key={entry.id ?? i}>
                  <td>{entry.actor || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(entry.timestamp || entry.created_at)}</td>
                  <td>{entry.action || '—'}</td>
                  <td>{entry.entity_type || '—'}</td>
                  <td>{entry.entity_id || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 300, wordBreak: 'break-all' }}>
                    {renderDetails(entry.details)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
