import { useEffect, useState, useCallback } from 'react';
import Icon from '../components/Icon.jsx';
import { Loading, ErrorState, EmptyState } from '../components/States.jsx';
import { errMsg, formatMoney } from '../utils.js';
import { getLocalities, getLocalityDetail } from '../analyticsApi.js';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Render a number with one decimal if fractional, else as integer. "—" if null/undefined. */
function fmtNum(value, decimals = 1) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return n % 1 === 0 ? n.toLocaleString('en-IN') : n.toFixed(decimals);
}

/** Render a percentage (0–1 or 0–100) with one decimal. "—" if null/undefined. */
function fmtPct(value) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  // Normalise: if the backend sends 0–1 range, multiply; if 0–100, use as-is.
  const pct = n > 1 ? n : n * 100;
  return `${pct.toFixed(1)}%`;
}

// ─── Fulfillment mix bar ─────────────────────────────────────────────────────

function MixBar({ mix }) {
  if (!mix) return <span className="locality-mix-na">—</span>;

  const pickup = Number(mix.pickup ?? 0);
  const delivery = Number(mix.delivery ?? 0);
  const total = pickup + delivery;

  if (total === 0) return <span className="locality-mix-na">—</span>;

  const pickupPct = (pickup / total) * 100;
  const deliveryPct = (delivery / total) * 100;

  return (
    <div className="locality-mix-wrap">
      <div className="locality-mix-bar" aria-label={`Pickup ${pickupPct.toFixed(0)}%, delivery ${deliveryPct.toFixed(0)}%`}>
        <div
          className="locality-mix-segment locality-mix-pickup"
          style={{ width: `${pickupPct}%` }}
        />
        <div
          className="locality-mix-segment locality-mix-delivery"
          style={{ width: `${deliveryPct}%` }}
        />
      </div>
      <div className="locality-mix-legend">
        <span className="locality-mix-legend-dot locality-mix-pickup-dot" />
        <span className="locality-mix-legend-label">Pickup {pickup.toLocaleString('en-IN')} ({pickupPct.toFixed(0)}%)</span>
        <span className="locality-mix-legend-dot locality-mix-delivery-dot" />
        <span className="locality-mix-legend-label">Delivery {delivery.toLocaleString('en-IN')} ({deliveryPct.toFixed(0)}%)</span>
      </div>
    </div>
  );
}

// ─── Locality card (list view) ───────────────────────────────────────────────

function LocalityCard({ item, onClick }) {
  return (
    <button
      type="button"
      className="locality-card"
      onClick={() => onClick(item.locality)}
    >
      <div className="locality-card-header">
        <span className="locality-card-icon">
          <Icon name="location" size={18} />
        </span>
        <span className="locality-card-name">{item.locality ?? '—'}</span>
        <span className="locality-card-kiranas">
          {item.active_kiranas ?? '—'} kirana{item.active_kiranas === 1 ? '' : 's'}
        </span>
      </div>

      <div className="locality-stats-row">
        <div className="locality-stat locality-stat-big">
          <span className="locality-stat-value">{fmtNum(item.orders_per_day)}</span>
          <span className="locality-stat-label">orders/day</span>
          {item.orders_per_day_per_km2 != null && (
            <span className="locality-stat-sub">{fmtNum(item.orders_per_day_per_km2, 2)}/km²</span>
          )}
        </div>

        <div className="locality-stat">
          <span className="locality-stat-value">{fmtPct(item.repeat_order_rate)}</span>
          <span className="locality-stat-label">repeat rate</span>
        </div>

        <div className="locality-stat">
          <span className="locality-stat-value">{formatMoney(item.aov)}</span>
          <span className="locality-stat-label">avg order value</span>
        </div>
      </div>

      <div className="locality-mix-section">
        <span className="locality-stat-label">Fulfillment mix</span>
        <MixBar mix={item.fulfillment_mix} />
      </div>

      <div className="locality-stats-row locality-stats-row-footer">
        <div className="locality-stat">
          <span className="locality-stat-value">{formatMoney(item.delivery_cost_per_order)}</span>
          <span className="locality-stat-label">delivery cost/order</span>
        </div>
        <div className="locality-stat">
          <span className="locality-stat-value">{formatMoney(item.revenue_per_order)}</span>
          <span className="locality-stat-label">revenue/order</span>
          {item.revenue_note && (
            <span className="locality-revenue-note">{item.revenue_note}</span>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Detail view ─────────────────────────────────────────────────────────────

function StatBlock({ label, value, sub }) {
  return (
    <div className="locality-detail-stat">
      <span className="locality-detail-stat-value">{value}</span>
      <span className="locality-detail-stat-label">{label}</span>
      {sub && <span className="locality-detail-stat-sub">{sub}</span>}
    </div>
  );
}

function LocalityDetail({ locality, onBack }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getLocalityDetail(locality);
      setDetail(data);
    } catch (err) {
      setError(errMsg(err, 'Could not load locality detail.'));
    } finally {
      setLoading(false);
    }
  }, [locality]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="locality-detail">
      <div className="locality-detail-back">
        <button type="button" className="btn btn-outline btn-sm locality-back-btn" onClick={onBack}>
          <Icon name="check" size={16} />
          Back to localities
        </button>
      </div>

      {loading && <Loading message={`Loading ${locality}…`} />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && !detail && (
        <EmptyState message="No detail available for this locality." />
      )}

      {!loading && !error && detail && (
        <>
          <header className="page-header locality-detail-header">
            <div className="locality-detail-title-row">
              <span className="locality-detail-icon">
                <Icon name="location" size={24} />
              </span>
              <h1>{detail.locality ?? locality}</h1>
            </div>
            <p>Locality detail — orders, kiranas and fulfillment</p>
          </header>

          <div className="locality-detail-grid">
            <StatBlock
              label="Active kiranas"
              value={detail.active_kiranas ?? '—'}
            />
            <StatBlock
              label="Orders / day"
              value={fmtNum(detail.orders_per_day)}
              sub={
                detail.orders_per_day_per_km2 != null
                  ? `${fmtNum(detail.orders_per_day_per_km2, 2)} / km²`
                  : undefined
              }
            />
            <StatBlock
              label="Repeat order rate"
              value={fmtPct(detail.repeat_order_rate)}
            />
            <StatBlock
              label="Avg order value"
              value={formatMoney(detail.aov)}
            />
            <StatBlock
              label="Delivery cost / order"
              value={formatMoney(detail.delivery_cost_per_order)}
            />
            <div className="locality-detail-stat">
              <span className="locality-detail-stat-value">{formatMoney(detail.revenue_per_order)}</span>
              <span className="locality-detail-stat-label">Revenue / order</span>
              {detail.revenue_note && (
                <span className="locality-revenue-note">{detail.revenue_note}</span>
              )}
            </div>
          </div>

          <div className="locality-detail-mix-section">
            <h2 className="locality-detail-section-title">Fulfillment mix</h2>
            <MixBar mix={detail.fulfillment_mix} />
          </div>
        </>
      )}
    </div>
  );
}

// ─── Page root ───────────────────────────────────────────────────────────────

export default function LocalityAnalytics() {
  const [localities, setLocalities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null); // locality name string

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getLocalities();
      setLocalities(data);
    } catch (err) {
      setError(errMsg(err, 'Could not load locality analytics.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Detail view
  if (selected) {
    return (
      <div className="page">
        <LocalityDetail locality={selected} onBack={() => setSelected(null)} />
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Locality analytics</h1>
        <p>Orders, kiranas and fulfillment by locality</p>
      </header>

      {loading && <Loading message="Loading locality analytics…" />}

      {!loading && error && (
        <ErrorState message={error} onRetry={load} />
      )}

      {!loading && !error && localities.length === 0 && (
        <EmptyState
          message={
            <>
              No data yet
              <br />
              <span style={{ fontSize: '13px' }}>
                Locality data will appear once orders flow through the platform.
              </span>
            </>
          }
        />
      )}

      {!loading && !error && localities.length > 0 && (
        <div className="locality-grid">
          {localities.map((item) => (
            <LocalityCard
              key={item.locality ?? Math.random()}
              item={item}
              onClick={setSelected}
            />
          ))}
        </div>
      )}
    </div>
  );
}
