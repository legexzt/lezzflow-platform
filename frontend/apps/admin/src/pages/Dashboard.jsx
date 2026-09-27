import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api.js';
import { Loading, ErrorState, EmptyState } from '../components/States.jsx';
import { errMsg, prettify } from '../utils.js';

const KNOWN_CARDS = [
  { keys: ['users', 'totalUsers', 'total_users'], label: 'Users', icon: '👥' },
  { keys: ['shops', 'totalShops', 'total_shops'], label: 'Shops', icon: '🏪' },
  { keys: ['products', 'totalProducts', 'total_products'], label: 'Products', icon: '🛒' },
  { keys: ['orders', 'totalOrders', 'total_orders'], label: 'Orders', icon: '📦' },
  { keys: ['partners', 'totalPartners', 'total_partners'], label: 'Delivery partners', icon: '🚚' },
  { keys: ['pendingKyc', 'pending_kyc', 'kycPending', 'pendingKycCount'], label: 'Pending KYC', icon: '🪪' },
];

function asNumber(v) {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object') {
    if (typeof v.total === 'number') return v.total;
    if (typeof v.count === 'number') return v.count;
  }
  return null;
}

function pick(obj, keys) {
  for (const k of keys) {
    const n = asNumber(obj?.[k]);
    if (n !== null) return { value: n, usedKey: k };
  }
  return null;
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/admin/stats');
      setStats(res.data || {});
    } catch (err) {
      setError(errMsg(err, 'Could not load platform stats.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <Loading message="Loading platform stats…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const usedKeys = new Set();
  const cards = [];
  for (const def of KNOWN_CARDS) {
    const hit = pick(stats, def.keys);
    if (hit) {
      usedKeys.add(hit.usedKey);
      cards.push({ label: def.label, icon: def.icon, value: hit.value });
    }
  }
  // Surface any other numeric top-level fields the API returns.
  for (const [key, value] of Object.entries(stats || {})) {
    if (usedKeys.has(key)) continue;
    const n = asNumber(value);
    if (n !== null) {
      cards.push({ label: prettify(key), icon: '📈', value: n });
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Dashboard</h1>
        <p>Platform overview</p>
      </header>

      {cards.length === 0 ? (
        <EmptyState message="No stats available yet." />
      ) : (
        <div className="card-grid">
          {cards.map((c) => (
            <div className="stat-card" key={c.label}>
              <span className="stat-icon">{c.icon}</span>
              <span className="stat-value">{c.value.toLocaleString('en-IN')}</span>
              <span className="stat-label">{c.label}</span>
            </div>
          ))}
        </div>
      )}

      <section className="quick-links">
        <h2>Manage</h2>
        <div className="quick-links-grid">
          <Link className="quick-link" to="/kyc">
            <span>🪪 Review partner KYC</span>
            <span>→</span>
          </Link>
          <Link className="quick-link" to="/shops">
            <span>🏪 View shops</span>
            <span>→</span>
          </Link>
          <Link className="quick-link" to="/orders">
            <span>📦 View orders</span>
            <span>→</span>
          </Link>
          <Link className="quick-link" to="/users">
            <span>👥 View users</span>
            <span>→</span>
          </Link>
          <Link className="quick-link" to="/products">
            <span>🛒 View products</span>
            <span>→</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
