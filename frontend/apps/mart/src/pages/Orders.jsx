import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api from '../api';
import { formatPrice } from '../shopUtils';
import Icon from '../components/Icon.jsx';

const POLL_MS = 10000;

// Honest timeline built ONLY from real backend order statuses.
// placed -> accepted -> packed -> on the way (assigned/picked) -> delivered
const TIMELINE_STEPS = [
  { key: 'placed', label: 'Placed' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'packed', label: 'Packed' },
  { key: 'on_the_way', label: 'On the way' },
  { key: 'delivered', label: 'Delivered' },
];

function stepIndexFor(status) {
  switch (status) {
    case 'placed': return 0;
    case 'accepted': return 1;
    case 'packed': return 2;
    case 'assigned':
    case 'picked': return 3;
    case 'delivered': return 4;
    default: return -1; // cancelled or unknown
  }
}

function OrderTimeline({ status }) {
  if (status === 'cancelled') {
    return (
      <div className="timeline timeline-cancelled">
        <span className="timeline-cancelled-label">
          <Icon name="close" size={14} /> Order cancelled
        </span>
      </div>
    );
  }
  const current = stepIndexFor(status);
  return (
    <ol className="timeline">
      {TIMELINE_STEPS.map((step, i) => {
        const done = current >= 0 && i < current;
        const active = i === current;
        return (
          <li key={step.key} className={`timeline-step${done ? ' done' : ''}${active ? ' active' : ''}`}>
            <span className="timeline-dot">
              {done && <Icon name="check" size={12} />}
            </span>
            <span className="timeline-label">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

function OrderCard({ order }) {
  const status = order.status || 'placed';
  const total = order.total ?? order.total_amount ?? order.amount;
  const shopName = order.shop_name || order.shop?.name || `Shop #${order.shop_id}`;
  const items = Array.isArray(order.items) ? order.items : [];
  const itemCount = items.reduce((n, i) => n + (Number(i.quantity) || 0), 0);
  const shopPhone = order.shop_phone || order.shop?.phone;
  const partnerPhone = order.partner_phone;
  const partnerAssigned = Boolean(partnerPhone);

  return (
    <div className="order-card">
      <div className="order-top">
        <div>
          <h3>{shopName}</h3>
          <p className="muted">
            Order #{String(order.id).slice(0, 8)} · {formatDate(order.created_at)}
          </p>
        </div>
        <span className={`status-chip status-${status}`}>{status}</span>
      </div>

      <OrderTimeline status={status} />

      <div className="order-meta">
        <span className="chip">
          {order.fulfillment === 'pickup' ? (<><Icon name="bag" size={14} /> Self-pickup</>) : (<><Icon name="scooter" size={14} /> Delivery</>)}
        </span>
        {itemCount > 0 && <span className="chip">{itemCount} items</span>}
        {total != null && <span className="chip">{formatPrice(total)}</span>}
      </div>
      {items.length > 0 && (
        <ul className="order-items">
          {items.map((item, idx) => (
            <li key={item.product_id ?? item.id ?? idx}>
              {item.name || item.product_name || `Item ${idx + 1}`} × {item.quantity}
            </li>
          ))}
        </ul>
      )}

      {(shopPhone || partnerAssigned) && (
        <div className="order-help">
          {shopPhone && (
            <a className="btn btn-outline btn-sm" href={`tel:${shopPhone}`}>
              <Icon name="help" size={14} /> Call shop
            </a>
          )}
          {partnerAssigned && (
            <a className="btn btn-outline btn-sm" href={`tel:${partnerPhone}`}>
              <Icon name="scooter" size={14} /> Call delivery partner
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default function Orders() {
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [notice] = useState(location.state?.notice || '');

  useEffect(() => {
    let cancelled = false;

    const load = async (showSpinner) => {
      if (showSpinner) setLoading(true);
      try {
        const res = await api.get('/api/orders');
        if (cancelled) return;
        const list = Array.isArray(res.data) ? res.data : res.data?.orders || [];
        setOrders(list);
        setError('');
        setLastUpdated(new Date());
      } catch (e) {
        if (!cancelled) {
          setError(e.response?.data?.error || 'Failed to load orders.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load(true);
    const timer = setInterval(() => load(false), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <h1>My Orders</h1>
        {lastUpdated && (
          <span className="muted live-indicator">
            ● Live · updated {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>

      {notice && <div className="banner banner-info">{notice}</div>}
      {error && <div className="banner banner-error">{error}</div>}

      {loading ? (
        <div className="center-screen">
          <div className="spinner" />
          <p>Loading orders…</p>
        </div>
      ) : orders.length === 0 ? (
        <>
          <p className="muted">You have not placed any orders yet.</p>
          <Link to="/" className="btn btn-primary">
            Browse shops
          </Link>
        </>
      ) : (
        <div className="order-list">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
}
