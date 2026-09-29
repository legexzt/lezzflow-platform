import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Loading, ErrorState, EmptyState } from '../components/States.jsx';
import api from '../api.js';
import { errMsg } from '../utils.js';

/**
 * Cluster launch gate (GTM cycle-3).
 * A locality counts as "ready" only when it has 25+ real live shops —
 * the API returns real counts only, so this page can never show a thin
 * locality as launched.
 */
export default function LaunchGate() {
  const [rows, setRows] = useState([]);
  const [threshold, setThreshold] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get('/v1/admin/analytics/launch-gate');
        if (!active) return;
        setRows(res.data?.localities || []);
        setThreshold(res.data?.threshold ?? 25);
      } catch (e) {
        if (active) setError(errMsg(e, 'Could not load the launch gate.'));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const readyCount = rows.filter((r) => r.ready).length;

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="page">
      <header className="page-header">
        <h1>Launch Gate</h1>
        <p>
          A cluster launches only with {threshold}+ live shops — never a thin,
          disappointing supply. {readyCount} of {rows.length} localities ready.
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState message="No locality data yet. Localities appear once shops are listed with coordinates." />
      ) : (
        <div className="card-grid">
          {rows.map((r) => {
            const pct = Math.min(100, Math.round((r.active_kiranas / threshold) * 100));
            return (
              <div className="stat-card" key={r.locality}>
                <span className="stat-icon">
                  <Icon name={r.ready ? 'check' : 'location'} size={22} />
                </span>
                <span className="stat-value">
                  {r.active_kiranas}
                  <span className="stat-sub">/{threshold} shops</span>
                </span>
                <span className="stat-label">{r.locality}</span>
                <div className="progress-track" aria-hidden="true">
                  <div
                    className={`progress-fill${r.ready ? ' is-ready' : ''}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className={`badge ${r.ready ? 'badge-green' : 'badge-amber'}`}>
                  {r.ready ? 'Ready to launch' : `Coming soon — ${r.shops_needed} more needed`}
                </span>
                <span className="stat-note">{r.active_kiranas_definition}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
