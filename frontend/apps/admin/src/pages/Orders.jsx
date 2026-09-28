import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api.js';
import { useAuth } from '../AuthContext.jsx';
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
    return o.items.reduce(
      (sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity ?? it.qty) || 1),
      0
    );
  }
  return null;
}

export default function Orders() {
  const { isOpsViewer } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const stuckParam = searchParams.get('stuck') || '';
  const attentionParam = searchParams.get('attention') || '';
  const statusParam = searchParams.get('status') || '';

  const [orders, setOrders] = useState([]);
  const [deliveryRequests, setDeliveryRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [nudgingId, setNudgingId] = useState(null);

  const isStuckMode = stuckParam === '30' || stuckParam === '60';
  const isUnassignedMode = attentionParam === 'unassigned';

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      if (isUnassignedMode) {
        const res = await api.get('/delivery/requests');
        setDeliveryRequests(asArray(res.data, ['requests']));
      } else if (isStuckMode) {
        const thresholdMinutes = parseInt(stuckParam, 10);
        const [placedRes, packedRes] = await Promise.all([
          api.get('/admin/orders', { params: { status: 'placed', limit: 100 } }),
          api.get('/admin/orders', { params: { status: 'packed', limit: 100 } }),
        ]);

        const placed = asArray(placedRes.data, ['orders']);
        const packed = asArray(packedRes.data, ['orders']);
        const merged = [...placed, ...packed];

        const now = Date.now();
        const thresholdMs = thresholdMinutes * 60 * 1000;

        const filtered = merged
          .filter((o) => {
            const t = new Date(o.created_at || o.createdAt).getTime();
            return !isNaN(t) && now - t >= thresholdMs;
          })
          .sort((a, b) => {
            const ta = new Date(a.created_at || a.createdAt).getTime() || 0;
            const tb = new Date(b.created_at || b.createdAt).getTime() || 0;
            return ta - tb; // oldest first
          });

        setOrders(filtered);
      } else {
        const res = await api.get('/admin/orders', {
          params: statusParam ? { status: statusParam } : {},
        });
        setOrders(asArray(res.data, ['orders']));
      }
    } catch (err) {
      setError(errMsg(err, 'Could not load orders.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [stuckParam, attentionParam, statusParam]);

  const onStatusFilter = (e) => {
    const s = e.target.value;
    const next = new URLSearchParams(searchParams);
    next.delete('stuck');
    next.delete('attention');
    if (s) {
      next.set('status', s);
    } else {
      next.delete('status');
    }
    setSearchParams(next);
  };

  const onStuckFilter = (e) => {
    const s = e.target.value;
    const next = new URLSearchParams(searchParams);
    next.delete('status');
    next.delete('attention');
    if (s) {
      next.set('stuck', s);
    } else {
      next.delete('stuck');
    }
    setSearchParams(next);
  };

  const clearSpecialFilters = () => {
    setSearchParams({});
  };

  const nudge = async (orderId, target) => {
    setNudgingId(orderId);
    setNotice(null);
    try {
      const res = await api.post(`/admin/orders/${orderId}/nudge`, { target });
      const contacts = res.data?.contacts || {};
      let contactDetail = '';
      if (target === 'seller') {
        const name = contacts.seller_name || 'Unknown';
        const phone = contacts.seller_phone ? ` ${contacts.seller_phone}` : '';
        contactDetail = `Seller: ${name}${phone}`;
      } else {
        const name = contacts.partner_name || 'Unassigned';
        const phone = contacts.partner_phone ? ` ${contacts.partner_phone}` : '';
        contactDetail = `Partner: ${name}${phone}`;
      }
      setNotice({
        type: 'success',
        text: `Nudge logged for order #${String(orderId).slice(0, 8)}. ${contactDetail}.`,
      });
    } catch (err) {
      setNotice({
        type: 'error',
        text: errMsg(err, `Failed to nudge ${target}.`),
      });
    } finally {
      setNudgingId(null);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Orders</h1>
        <p>Every order across all shops</p>
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
        <select
          className="filter-select"
          value={isStuckMode || isUnassignedMode ? '' : statusParam}
          onChange={onStatusFilter}
          disabled={isUnassignedMode}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>

        <select
          className="filter-select"
          value={isStuckMode ? stuckParam : ''}
          onChange={onStuckFilter}
          disabled={isUnassignedMode}
        >
          <option value="">All orders</option>
          <option value="30">Stuck 30+ min</option>
          <option value="60">Stuck 60+ min</option>
        </select>

        {isUnassignedMode && (
          <button className="btn btn-outline btn-sm" type="button" onClick={clearSpecialFilters}>
            Clear unassigned filter
          </button>
        )}

        {!loading && !error && !isUnassignedMode && (
          <span className="results-count">
            {orders.length} {orders.length === 1 ? 'order' : 'orders'}
          </span>
        )}
      </div>

      {isStuckMode && (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          Showing orders stuck in placed/packed for {stuckParam}+ min (oldest first).
        </div>
      )}

      {loading ? (
        <Loading message="Loading orders…" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : isUnassignedMode ? (
        /* Dedicated Unassigned Deliveries Table */
        <div>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>Deliveries awaiting a partner</h2>
          {deliveryRequests.length === 0 ? (
            <EmptyState message="No deliveries currently awaiting a partner." />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Shop</th>
                    <th>Requested</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveryRequests.map((req, i) => (
                    <tr key={req.id || i}>
                      <td>
                        <span className="cell-title">
                          #{String(req.order_id || req.id).slice(0, 8)}
                        </span>
                      </td>
                      <td>{req.shop_name || `Shop #${req.shop_id || '—'}`}</td>
                      <td>{formatDateTime(req.created_at || req.createdAt)}</td>
                      <td>
                        <span className={statusBadge(req.status)}>{req.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          message={
            isStuckMode
              ? `No orders stuck for ${stuckParam}+ min.`
              : statusParam
              ? `No orders with status “${statusParam}”.`
              : 'No orders yet.'
          }
        />
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
                {isStuckMode && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {orders.map((o, i) => {
                const id = o.id || o._id || o.order_id || i;
                const count = itemCount(o);
                const total = orderTotal(o);
                const isNudging = nudgingId === id;

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
                    {isStuckMode && (
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-sm btn-outline"
                            type="button"
                            disabled={isOpsViewer || isNudging}
                            title={isOpsViewer ? 'Read-only access' : undefined}
                            onClick={() => nudge(id, 'seller')}
                          >
                            Notify seller
                          </button>
                          <button
                            className="btn btn-sm btn-outline"
                            type="button"
                            disabled={isOpsViewer || isNudging}
                            title={isOpsViewer ? 'Read-only access' : undefined}
                            onClick={() => nudge(id, 'partner')}
                          >
                            Notify partner
                          </button>
                        </div>
                      </td>
                    )}
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
