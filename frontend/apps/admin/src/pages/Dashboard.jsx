import Icon from '../components/Icon.jsx';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api.js';
import { Loading, ErrorState, EmptyState } from '../components/States.jsx';
import { asArray, errMsg, prettify } from '../utils.js';

const KNOWN_CARDS = [
  { keys: ['users', 'totalUsers', 'total_users'], label: 'Users', icon: 'users' },
  { keys: ['shops', 'totalShops', 'total_shops'], label: 'Shops', icon: 'home' },
  { keys: ['products', 'totalProducts', 'total_products'], label: 'Products', icon: 'cart' },
  { keys: ['orders', 'totalOrders', 'total_orders'], label: 'Orders', icon: 'box' },
  { keys: ['partners', 'totalPartners', 'total_partners'], label: 'Delivery partners', icon: 'scooter' },
  { keys: ['pendingKyc', 'pending_kyc', 'kycPending', 'pendingKycCount'], label: 'Pending KYC', icon: 'idcard' },
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
  const [attention, setAttention] = useState({
    pendingKyc: 0,
    stuckOrders: 0,
    emptyShops: 0,
    emptyShopsSampled: false,
    unassignedDeliveries: 0,
  });
  const [stripFailed, setStripFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // null = not loaded / fetch failed (hide section); number = bps value
  const [commissionBps, setCommissionBps] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    setStripFailed(false);

    const [statsRes, placedRes, packedRes, shopsRes, productsRes, deliveryRes, configRes] =
      await Promise.allSettled([
        api.get('/admin/stats'),
        api.get('/admin/orders', { params: { status: 'placed', limit: 100 } }),
        api.get('/admin/orders', { params: { status: 'packed', limit: 100 } }),
        api.get('/admin/shops', { params: { limit: 100 } }),
        api.get('/admin/products', { params: { limit: 100 } }),
        api.get('/delivery/requests'),
        api.get('/v1/config'),
      ]);

    if (statsRes.status === 'fulfilled') {
      setStats(statsRes.value?.data || {});
    } else {
      setError(errMsg(statsRes.reason, 'Could not load platform stats.'));
    }

    // Commission config (public key, admin can read/write it)
    if (configRes.status === 'fulfilled') {
      const bps = configRes.value?.data?.commission_bps;
      setCommissionBps(Number.isInteger(bps) && bps >= 0 ? bps : null);
    } else {
      setCommissionBps(null);
    }

    let hasFailure = false;
    let pendingKycCount = 0;
    if (statsRes.status === 'fulfilled') {
      const s = statsRes.value?.data || {};
      pendingKycCount = asNumber(s.pendingKyc) ?? asNumber(s.pending_kyc) ?? 0;
    } else {
      hasFailure = true;
    }

    let stuckCount = 0;
    if (placedRes.status === 'fulfilled' || packedRes.status === 'fulfilled') {
      const now = Date.now();
      const thresholdMs = 30 * 60 * 1000;
      const placed =
        placedRes.status === 'fulfilled' ? asArray(placedRes.value?.data, ['orders']) : [];
      const packed =
        packedRes.status === 'fulfilled' ? asArray(packedRes.value?.data, ['orders']) : [];
      const combined = [...placed, ...packed];
      stuckCount = combined.filter((o) => {
        const t = new Date(o.created_at || o.createdAt).getTime();
        return !isNaN(t) && now - t >= thresholdMs;
      }).length;
      if (placedRes.status === 'rejected' || packedRes.status === 'rejected') {
        hasFailure = true;
      }
    } else {
      hasFailure = true;
    }

    let emptyShopsCount = 0;
    let isProductsSampled = false;
    if (shopsRes.status === 'fulfilled' && productsRes.status === 'fulfilled') {
      const shopsList = asArray(shopsRes.value?.data, ['shops']);
      const productsList = asArray(productsRes.value?.data, ['products']);
      const productShopIds = new Set(
        productsList.map((p) => p.shop_id || p.shop?.id).filter(Boolean)
      );
      emptyShopsCount = shopsList.filter((s) => !productShopIds.has(s.id)).length;
      const totalProducts = productsRes.value?.data?.pagination?.total;
      isProductsSampled = typeof totalProducts === 'number' && totalProducts > productsList.length;
    } else {
      hasFailure = true;
    }

    let unassignedDeliveriesCount = 0;
    if (deliveryRes.status === 'fulfilled') {
      const deliveryList = asArray(deliveryRes.value?.data, ['requests']);
      unassignedDeliveriesCount = deliveryList.length;
    } else {
      hasFailure = true;
    }

    setAttention({
      pendingKyc: pendingKycCount,
      stuckOrders: stuckCount,
      emptyShops: emptyShopsCount,
      emptyShopsSampled: isProductsSampled,
      unassignedDeliveries: unassignedDeliveriesCount,
    });
    setStripFailed(hasFailure);

    setLoading(false);
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
      cards.push({ label: prettify(key), icon: 'chart', value: n });
    }
  }

  const allClear =
    attention.pendingKyc === 0 &&
    attention.stuckOrders === 0 &&
    attention.emptyShops === 0 &&
    attention.unassignedDeliveries === 0;

  return (
    <div className="page">
      <header className="page-header">
        <h1>Dashboard</h1>
        <p>Platform overview</p>
      </header>

      <section className="attention-section">
        <h2>Needs attention</h2>
        {stripFailed && <p className="attention-note">Could not load attention items.</p>}
        {allClear ? (
          <div className="attention-tile is-clear">
            <span className="attention-icon"><Icon name="check" size={24} /></span>
            <span className="attention-label">All clear — nothing needs attention right now.</span>
          </div>
        ) : (
          <div className="attention-strip">
            <Link
              to="/kyc"
              className={`attention-tile ${attention.pendingKyc === 0 ? 'is-zero' : ''}`}
            >
              <span className="attention-icon"><Icon name="idcard" size={22} /></span>
              <span className="attention-count">{attention.pendingKyc}</span>
              <span className="attention-label">Pending KYC</span>
              <span className="attention-sub">awaiting review</span>
            </Link>

            <Link
              to="/orders?stuck=30"
              className={`attention-tile ${attention.stuckOrders === 0 ? 'is-zero' : ''}`}
            >
              <span className="attention-icon"><Icon name="warning" size={22} /></span>
              <span className="attention-count">{attention.stuckOrders}</span>
              <span className="attention-label">Stuck orders</span>
              <span className="attention-sub">in placed/packed 30+ min</span>
            </Link>

            <Link
              to="/shops?empty=1"
              className={`attention-tile ${attention.emptyShops === 0 ? 'is-zero' : ''}`}
              title={attention.emptyShopsSampled ? 'Counts sampled from loaded products' : undefined}
            >
              <span className="attention-icon"><Icon name="home" size={22} /></span>
              <span className="attention-count">{attention.emptyShops}</span>
              <span className="attention-label">Shops with zero products</span>
              <span className="attention-sub">no products listed</span>
            </Link>

            <Link
              to="/orders?attention=unassigned"
              className={`attention-tile ${attention.unassignedDeliveries === 0 ? 'is-zero' : ''}`}
            >
              <span className="attention-icon"><Icon name="scooter" size={22} /></span>
              <span className="attention-count">{attention.unassignedDeliveries}</span>
              <span className="attention-label">Deliveries awaiting partner</span>
              <span className="attention-sub">no partner assigned</span>
            </Link>
          </div>
        )}
      </section>

      {commissionBps !== null && (
        <section className="commission-section">
          <h2>Pricing & commission</h2>
          <div className="attention-tile">
            <span className="attention-icon"><Icon name="chart" size={22} /></span>
            <span className="attention-label">
              {commissionBps === 0
                ? '₹0 commission during beta. Future pricing will be published transparently before activation.'
                : `${commissionBps / 100}% commission. Future pricing will be published transparently before activation.`}
            </span>
          </div>
        </section>
      )}

      {cards.length === 0 ? (
        <EmptyState message="No stats available yet." />
      ) : (
        <div className="card-grid">
          {cards.map((c) => (
            <div className="stat-card" key={c.label}>
              <span className="stat-icon"><Icon name={c.icon} size={22} /></span>
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
            <span><Icon name="idcard" size={16} /> Review partner KYC</span>
            <span>→</span>
          </Link>
          <Link className="quick-link" to="/shops">
            <span><Icon name="home" size={16} /> View shops</span>
            <span>→</span>
          </Link>
          <Link className="quick-link" to="/orders">
            <span><Icon name="box" size={16} /> View orders</span>
            <span>→</span>
          </Link>
          <Link className="quick-link" to="/users">
            <span><Icon name="users" size={16} /> View users</span>
            <span>→</span>
          </Link>
          <Link className="quick-link" to="/products">
            <span><Icon name="cart" size={16} /> View products</span>
            <span>→</span>
          </Link>
          <Link className="quick-link" to="/launch-gate">
            <span><Icon name="location" size={16} /> Cluster launch gate</span>
            <span>→</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
