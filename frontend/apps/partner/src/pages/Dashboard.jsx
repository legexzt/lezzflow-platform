import { useCallback, useEffect, useMemo, useState } from 'react';
import Alert from '../components/Alert';
import Header from '../components/Header';
import {
  acceptDelivery,
  fetchDeliveryRequests,
  updateDeliveryStatus,
} from '../api';

// ---- Response normalization helpers (tolerant of backend field naming) ----

function asArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const key of ['requests', 'deliveries', 'data', 'items']) {
      if (Array.isArray(data[key])) return data[key];
    }
  }
  return [];
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function getId(d) {
  return d.id ?? d._id ?? d.delivery_id ?? d.request_id;
}

function getStatus(d) {
  return String(d.status ?? d.delivery_status ?? '').toLowerCase();
}

function getShopName(d) {
  return d.shop_name || d.shop?.name || 'Pickup point';
}

function getPickup(d) {
  return d.pickup_address || d.shop?.address || d.shop_address || '';
}

function getDrop(d) {
  return d.drop_address || d.customer_address || d.delivery_address || d.address || '';
}

function getOrderLabel(d) {
  const o = d.order_id ?? d.orderId ?? d.order?.id;
  return o ? `#${o}` : '';
}

const INACTIVE = new Set(['accepted', 'picked', 'delivered', 'cancelled', 'canceled', 'rejected']);

function computeEarnings(list) {
  return { completed: list.filter((d) => getStatus(d) === 'delivered').length };
}

// ---- Component ----

export default function Dashboard() {
  const [deliveries, setDeliveries] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async (mode = 'refresh') => {
    if (mode === 'initial') setInitialLoading(true);
    else setRefreshing(true);
    try {
      const data = await fetchDeliveryRequests();
      setDeliveries(asArray(data));
      setError('');
    } catch (e) {
      setError(e.friendlyMessage || 'Could not load delivery requests.');
    }
    if (mode === 'initial') setInitialLoading(false);
    else setRefreshing(false);
  }, []);

  useEffect(() => {
    load('initial');
    const timer = setInterval(() => load('refresh'), 30000);
    return () => clearInterval(timer);
  }, [load]);

  const derived = useMemo(() => computeEarnings(deliveries), [deliveries]);

  const active = deliveries.filter((d) => ['accepted', 'picked'].includes(getStatus(d)));
  const available = deliveries.filter((d) => !INACTIVE.has(getStatus(d)));

  async function handleAccept(d) {
    const id = getId(d);
    if (!id) return;
    setBusyId(id);
    setNotice('');
    setError('');
    try {
      await acceptDelivery(id);
      setNotice('Delivery accepted. Head to the pickup point.');
      await load('refresh');
    } catch (e) {
      setError(
        e.friendlyMessage || 'Could not accept this delivery. It may have been taken by another partner.'
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleStatus(d, status) {
    const id = getId(d);
    if (!id) return;
    setBusyId(id);
    setNotice('');
    setError('');
    try {
      await updateDeliveryStatus(id, status);
      setNotice(status === 'picked' ? 'Order picked up. Head to the customer.' : 'Delivered. Great job!');
      await load('refresh');
    } catch (e) {
      setError(e.friendlyMessage || 'Could not update the delivery status.');
    } finally {
      setBusyId(null);
    }
  }

  function Route({ pickup, drop, masked }) {
    return (
      <div className="delivery-route">
        <div>
          <span className="route-dot route-dot-pickup" />
          <div>
            <small>Pickup</small>
            <p>{pickup || (masked ? 'Shared after acceptance' : '—')}</p>
          </div>
        </div>
        <div>
          <span className="route-dot route-dot-drop" />
          <div>
            <small>Drop</small>
            <p>{drop || (masked ? 'Shared after acceptance' : '—')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <Header />
      <main className="container">
        <h1 className="page-title">Deliveries</h1>

        {error ? (
          <Alert type="error" onClose={() => setError('')}>
            {error}
          </Alert>
        ) : null}
        {notice ? (
          <Alert type="success" onClose={() => setNotice('')}>
            {notice}
          </Alert>
        ) : null}

        <section className="earnings-grid" aria-label="Deliveries summary">
          <div className="card earnings-card">
            <span className="earnings-label">Deliveries completed</span>
            <span className="earnings-value">{derived.completed}</span>
          </div>
        </section>

        {active.length > 0 ? (
          <section>
            <h2 className="section-title">Active delivery</h2>
            {active.map((d, i) => {
              const id = getId(d);
              const s = getStatus(d);
              return (
                <article className="card delivery-card delivery-active" key={id ?? `active-${i}`}>
                  <header className="delivery-head">
                    <strong>{getShopName(d)}</strong>
                    <span className={`badge ${s === 'picked' ? 'badge-blue' : 'badge-green'}`}>{s}</span>
                  </header>
                  {getOrderLabel(d) ? <p className="muted tiny">Order {getOrderLabel(d)}</p> : null}
                  <Route pickup={getPickup(d)} drop={getDrop(d)} masked={false} />
                  <div className="delivery-foot">
                    {s === 'accepted' ? (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busyId === id}
                        onClick={() => handleStatus(d, 'picked')}
                      >
                        {busyId === id ? 'Updating…' : 'Mark picked up'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busyId === id}
                        onClick={() => handleStatus(d, 'delivered')}
                      >
                        {busyId === id ? 'Updating…' : 'Mark delivered'}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        ) : null}

        <section>
          <div className="section-head">
            <h2 className="section-title">Available requests</h2>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => load('refresh')}
              disabled={refreshing}
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {initialLoading ? (
            <div className="screen-center">
              <div className="spinner" aria-label="Loading deliveries" />
            </div>
          ) : available.length === 0 ? (
            <div className="card empty-state">
              <p>No delivery requests right now.</p>
              <p className="muted">New requests from nearby shops will appear here automatically.</p>
            </div>
          ) : (
            available.map((d, i) => {
              const id = getId(d);
              const distance = num(d.distance_km ?? d.distance);
              return (
                <article className="card delivery-card" key={id ?? `req-${i}`}>
                  <header className="delivery-head">
                    <strong>{getShopName(d)}</strong>
                    {distance !== null ? <span className="muted tiny">{distance} km</span> : null}
                  </header>
                  {getOrderLabel(d) ? <p className="muted tiny">Order {getOrderLabel(d)}</p> : null}
                  <Route pickup={getPickup(d)} drop={getDrop(d)} masked />
                  <div className="delivery-foot">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busyId === id}
                      onClick={() => handleAccept(d)}
                    >
                      {busyId === id ? 'Accepting…' : 'Accept'}
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </section>
      </main>
    </div>
  );
}
