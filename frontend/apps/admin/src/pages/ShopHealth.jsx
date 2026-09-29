import { useEffect, useState } from 'react';
import api from '../api.js';
import { Loading, ErrorState, EmptyState } from '../components/States.jsx';
import { errMsg } from '../utils.js';

const HEALTH_BADGE = {
  active: 'badge-green',
  sleeping: 'badge-amber',
  dormant: 'badge-red',
  closed: 'badge-grey',
};

export default function ShopHealth() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/admin/shop-health');
      setData(res.data);
    } catch (err) {
      setError(errMsg(err, 'Could not load shop health.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const liveCount = data ? data.shops.filter((s) => s.is_live && s.is_open).length : 0;

  return (
    <div className="page">
      <header className="page-header">
        <h1>Shop Health</h1>
        <p>Post-onboarding liveness + per-shop unit economics — real data only, dormant first</p>
      </header>

      {loading ? (
        <Loading message="Loading shop health…" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data || data.shops.length === 0 ? (
        <EmptyState message="No shops registered yet." />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <span className="badge badge-blue">Shops: {data.shops.length}</span>
            <span className="badge badge-green">Live: {liveCount}</span>
            <span className="badge badge-red">
              Dormant: {data.shops.filter((s) => s.health === 'dormant').length}
            </span>
            <span className="badge badge-amber">
              Cluster gate: {liveCount >= 25 ? 'PASS (25+ live)' : `${liveCount}/25 live needed`}
            </span>
          </div>

          <h2>Per-locality rollup</h2>
          <div className="table-wrap" style={{ marginBottom: 24 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Locality</th>
                  <th>Shops</th>
                  <th>Live</th>
                  <th>Dormant</th>
                  <th>Orders (7d)</th>
                  <th>GMV (7d)</th>
                </tr>
              </thead>
              <tbody>
                {data.locality.map((l) => (
                  <tr key={l.locality}>
                    <td><strong>{l.locality}</strong></td>
                    <td>{l.shops}</td>
                    <td>{l.live}</td>
                    <td>{l.dormant}</td>
                    <td>{l.orders_7d}</td>
                    <td>₹{l.gmv_7d.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>Shops (dormant first)</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Shop</th>
                  <th>Health</th>
                  <th>Last order</th>
                  <th>Orders (7d)</th>
                  <th>GMV (7d)</th>
                  <th>Active offers</th>
                </tr>
              </thead>
              <tbody>
                {data.shops.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.name}</strong>
                      <div className="muted">{s.address || '—'}</div>
                    </td>
                    <td>
                      <span className={`badge ${HEALTH_BADGE[s.health] || 'badge-grey'}`}>
                        {s.health.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      {s.days_since_last_order === null
                        ? 'Never'
                        : s.days_since_last_order === 0
                          ? 'Today'
                          : `${s.days_since_last_order}d ago`}
                    </td>
                    <td>{s.orders_7d}</td>
                    <td>₹{s.gmv_7d.toLocaleString('en-IN')}</td>
                    <td>{s.active_offers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
