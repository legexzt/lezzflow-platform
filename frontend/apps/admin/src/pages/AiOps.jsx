import { useEffect, useState } from 'react';
import api from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { Loading, ErrorState, EmptyState } from '../components/States.jsx';
import { errMsg } from '../utils.js';

export default function AiOps() {
  const { isOpsViewer } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/admin/ai-ops');
      setData(res.data);
    } catch (err) {
      setError(errMsg(err, 'Could not load AI ops.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (isOpsViewer) {
    return (
      <div className="page">
        <header className="page-header">
          <h1>AI Ops</h1>
        </header>
        <EmptyState message="AI cost data is restricted to full admins." />
      </div>
    );
  }

  const w = data?.last_7d;

  return (
    <div className="page">
      <header className="page-header">
        <h1>AI Ops</h1>
        <p>Real AI scan call counts, timeout rate and cost band — no estimates presented as bills</p>
      </header>

      {loading ? (
        <Loading message="Loading AI ops…" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !w || w.total_calls === 0 ? (
        <EmptyState message="No AI/scan calls logged in the last 7 days." />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <span className="badge badge-blue">Calls (7d): {w.total_calls}</span>
            <span className="badge badge-green">OK: {w.ok}</span>
            <span className={`badge ${w.timeouts > 0 ? 'badge-amber' : 'badge-grey'}`}>
              Timeouts: {w.timeouts} ({w.timeout_rate_pct}%)
            </span>
            <span className={`badge ${w.errors > 0 ? 'badge-red' : 'badge-grey'}`}>
              Errors: {w.errors}
            </span>
          </div>

          <section className="card" style={{ marginBottom: 24 }}>
            <h2 style={{ marginTop: 0 }}>Cost band (7d)</h2>
            <p style={{ fontSize: '1.1em' }}><strong>{w.cost_band}</strong></p>
            <p className="muted">
              Band = AI scan count × public per-call list-price range. This is a planning
              guide, not your AWS bill — check AWS Cost Explorer for the real number.
            </p>
          </section>

          <h2>Calls by kind × status (7d)</h2>
          <div className="table-wrap" style={{ marginBottom: 24 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Status</th>
                  <th>Calls</th>
                </tr>
              </thead>
              <tbody>
                {w.by_kind_status.map((r, i) => (
                  <tr key={i}>
                    <td>{r.kind}</td>
                    <td>
                      <span className={`badge ${r.status === 'ok' ? 'badge-green' : r.status === 'timeout' ? 'badge-amber' : 'badge-red'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td>{r.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>Async scan queue (7d)</h2>
          {data.scan_queue_7d.length === 0 ? (
            <EmptyState message="No scan jobs in the last 7 days." />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Kind</th>
                    <th>Status</th>
                    <th>Jobs</th>
                  </tr>
                </thead>
                <tbody>
                  {data.scan_queue_7d.map((r, i) => (
                    <tr key={i}>
                      <td>{r.kind}</td>
                      <td>{r.status}</td>
                      <td>{r.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
