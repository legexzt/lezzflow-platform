import { useEffect, useState } from 'react';
import api from '../api.js';
import { Loading, ErrorState, EmptyState } from '../components/States.jsx';
import { asArray, errMsg, formatDateTime, formatMoney, statusBadge } from '../utils.js';

const STATUSES = ['placed', 'accepted', 'packed', 'requested', 'picked', 'delivered', 'cancelled'];

const shopName = (o) =>
  o.shop_name ||
  o.shopName ||
  o.shop?.name ||
  (o.shop_id ? `Shop #${String(o.shop_id).slice(0, 8)}` : '—');

const customerName = (o) =>
  o.customer_name ||
  o.customerName ||
  o.customer?.name ||
  o.user?.name ||
  o.customer_email ||
  o.customerEmail ||
  '—';

function itemCount(o) {
  if (Array.isArray(o.items)) {
    return o.items.reduce((n, it) => n + (Number(it.quantity ?? it.qty) || 1), 0);
  }
  return o.item_count ?? o.itemCount ?? null;
}

function orderTotal(o) {
  const t = o.total ?? o.total_amount ?? o.totalAmount ?? o.amount;
  if (t !== undefined && t !== null && t !== '') return t;
  if (Array.isArray(o.items) && o.items.length > 0) {
    return o.items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity ?? it.qty) || 1), 0);
  }
  return null;
}

export default function Orders() {
  const [status, setStatus] = useState('');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async (s) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/admin/orders', { params: s ? { status: s } : {} });
      setOrders(asArray(res.data, ['orders']));
    } catch (err) {
      setError(errMsg(err, 'Could not load orders.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load('');
  }, []);

  const onFilter = (e) => {
    const s = e.target.value;
    setStatus(s);
    load(s);
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Orders</h1>
        <p>Every order across all shops</p>
      </header>

      <div className="filters">
        <select className="filter-select" value={status} onChange={onFilter}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        {!loading && !error && (
          <span className="results-count">
            {orders.length} {orders.length === 1 ? 'order' : 'orders'}
          </span>
        )}
      </div>

      {loading ? (
        <Loading message="Loading orders…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => load(status)} />
      ) : orders.length === 0 ? (
        <EmptyState message={status ? `No orders with status “${status}”.` : 'No orders yet.'} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Shop</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Total</th>
                <th>Fulfillment</th>
                <th>Status</th>
                <th>Placed</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o, i) => {
                const id = o.id || o._id || o.order_id || i;
                const count = itemCount(o);
                const total = orderTotal(o);
                return (
                  <tr key={id}>
                    <td>
                      <span className="cell-title">#{String(id).slice(0, 8)}</span>
                    </td>
                    <td>{shopName(o)}</td>
                    <td>{customerName(o)}</td>
                    <td>{count === null ? '—' : count}</td>
                    <td>{formatMoney(total)}</td>
                    <td>
                      {o.fulfillment ? (
                        <span className={statusBadge(o.fulfillment)}>{o.fulfillment}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {o.status ? (
                        <span className={statusBadge(o.status)}>{o.status}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{formatDateTime(o.created_at || o.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
