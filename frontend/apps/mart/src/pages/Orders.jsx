import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api from '../api';
import { formatPrice } from '../shopUtils';
import Icon from '../components/Icon.jsx';

const POLL_MS = 10000;

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
