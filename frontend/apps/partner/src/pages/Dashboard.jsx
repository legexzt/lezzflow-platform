import { useCallback, useEffect, useMemo, useState } from 'react';
import Alert from '../components/Alert';
import Header from '../components/Header';
import Icon from '../components/Icon';
import OtpModal from '../components/OtpModal';
import TrainingPrimer from '../components/TrainingPrimer';
import {
  acceptDelivery,
  fetchDeliveryRequests,
  fetchMyProfile,
  updateDeliveryStatus,
  updateMyProfile,
} from '../api';

// ---- Normalization helpers ----

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

// ---- Date grouping helpers for Mon-Sun weekly ledger ----

function isSameDay(d1, d2) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function isCurrentWeekMonSun(targetDate, now = new Date()) {
  const day = now.getDay();
  const distanceToMonday = (day + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - distanceToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return targetDate >= monday && targetDate <= sunday;
}

function computeDeliveredStats(deliveries) {
  const delivered = deliveries.filter((d) => getStatus(d) === 'delivered');
  const now = new Date();

  let todayCount = 0;
  let todayFee = 0;
  let hasTodayFee = false;

  let weekCount = 0;
  let weekFee = 0;
  let hasWeekFee = false;

  let allCount = delivered.length;
  let allFee = 0;
  let hasAllFee = false;

  for (const d of delivered) {
    const rawDate = d.updated_at || d.created_at;
    const date = rawDate ? new Date(rawDate) : null;
    const fee = d.delivery_fee != null ? Number(d.delivery_fee) : null;
    const feeValid = Number.isFinite(fee);

    if (feeValid) {
      allFee += fee;
      hasAllFee = true;
    }

    if (date && !isNaN(date.getTime())) {
      if (isSameDay(date, now)) {
        todayCount++;
        if (feeValid) {
          todayFee += fee;
          hasTodayFee = true;
        }
      }
      if (isCurrentWeekMonSun(date, now)) {
        weekCount++;
        if (feeValid) {
          weekFee += fee;
          hasWeekFee = true;
        }
      }
    }
  }

  return {
    delivered,
    today: { count: todayCount, fee: hasTodayFee ? todayFee : null },
    week: { count: weekCount, fee: hasWeekFee ? weekFee : null },
    all: { count: allCount, fee: hasAllFee ? allFee : null },
    hasAnyFee: hasAllFee,
  };
}

export default function Dashboard() {
  const [deliveries, setDeliveries] = useState([]);
  const [profile, setProfile] = useState({ is_online: false, training_completed: false });
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingDuty, setTogglingDuty] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // UI state
  const [activeTab, setActiveTab] = useState('deliveries');
  const [otpModal, setOtpModal] = useState({ isOpen: false, type: null, delivery: null });
  const [showPrimer, setShowPrimer] = useState(false);
  const [pendingAcceptDelivery, setPendingAcceptDelivery] = useState(null);

  const loadProfile = useCallback(async () => {
    try {
      const data = await fetchMyProfile();
      if (data) {
        setProfile(data);
      }
    } catch {
      // Non-fatal, profile can be retried on next poll
    }
  }, []);

  const loadDeliveries = useCallback(async (mode = 'refresh') => {
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

  const refreshAll = useCallback(
    async (mode = 'refresh') => {
      await Promise.all([loadDeliveries(mode), loadProfile()]);
    },
    [loadDeliveries, loadProfile]
  );

  useEffect(() => {
    refreshAll('initial');
    const timer = setInterval(() => refreshAll('refresh'), 30000);
    return () => clearInterval(timer);
  }, [refreshAll]);

  const active = deliveries.filter((d) => ['accepted', 'picked'].includes(getStatus(d)));
  const available = deliveries.filter((d) => !INACTIVE.has(getStatus(d)));

  // Nearest-first sorting for available requests (NULLs last)
  const sortedAvailable = useMemo(() => {
    return [...available].sort((a, b) => {
      const da = num(a.distance_km ?? a.distance);
      const db = num(b.distance_km ?? b.distance);
      if (da !== null && db !== null) return da - db;
      if (da !== null && db === null) return -1;
      if (da === null && db !== null) return 1;
      return 0;
    });
  }, [available]);

  const earningsStats = useMemo(() => computeDeliveredStats(deliveries), [deliveries]);

  // Duty Toggle
  async function handleToggleDuty() {
    setTogglingDuty(true);
    setError('');
    const targetStatus = !profile.is_online;
    try {
      const updated = await updateMyProfile({ is_online: targetStatus });
      setProfile((prev) => ({ ...prev, ...updated }));
      await loadDeliveries('refresh');
    } catch (e) {
      setError(e.friendlyMessage || 'Could not update duty status.');
    } finally {
      setTogglingDuty(false);
    }
  }

  // Delivery Acceptance
  async function doAccept(d) {
    const id = getId(d);
    if (!id) return;
    setBusyId(id);
    setNotice('');
    setError('');
    try {
      await acceptDelivery(id);
      setNotice('Delivery accepted. Head to the pickup point.');
      await loadDeliveries('refresh');
    } catch (e) {
      setError(
        e.friendlyMessage || 'Could not accept this delivery. It may have been taken by another partner.'
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleAcceptClick(d) {
    if (!profile.training_completed) {
      setPendingAcceptDelivery(d);
      setShowPrimer(true);
      return;
    }
    await doAccept(d);
  }

  async function handleCompleteTraining() {
    try {
      const updated = await updateMyProfile({ training_completed: true });
      setProfile((prev) => ({ ...prev, ...updated }));
      setShowPrimer(false);
      if (pendingAcceptDelivery) {
        const d = pendingAcceptDelivery;
        setPendingAcceptDelivery(null);
        await doAccept(d);
      }
    } catch (e) {
      setError(e.friendlyMessage || 'Could not save training status.');
    }
  }

  // OTP Modal
  function openOtpModal(delivery, type) {
    setOtpModal({ isOpen: true, type, delivery });
  }

  function closeOtpModal() {
    setOtpModal({ isOpen: false, type: null, delivery: null });
  }

  async function handleOtpSubmit(otp) {
    const { delivery, type } = otpModal;
    const id = getId(delivery);
    if (!id) return;

    await updateDeliveryStatus(id, type, otp);
    setNotice(type === 'picked' ? 'Order picked up. Head to the customer.' : 'Delivered. Great job!');
    await loadDeliveries('refresh');
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
        {/* Duty Toggle Card */}
        <section className={`card duty-card ${profile.is_online ? 'duty-online' : 'duty-offline'}`}>
          <div className="duty-info">
            <div className={`duty-icon ${profile.is_online ? 'duty-icon-online' : 'duty-icon-offline'}`}>
              <Icon name="scooter" size={24} />
            </div>
            <div>
              <div className="duty-status-line">
                <span className={`duty-indicator ${profile.is_online ? 'indicator-online' : 'indicator-offline'}`} />
                <strong className="duty-headline">
                  {profile.is_online ? "You're online — new requests will reach you" : "You're offline"}
                </strong>
              </div>
              <p className="duty-subtext muted tiny">
                {profile.is_online
                  ? 'Stay online to receive delivery requests nearby.'
                  : 'Go online to receive and accept delivery requests.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className={`btn ${profile.is_online ? 'btn-ghost' : 'btn-primary'} btn-sm duty-toggle-btn`}
            onClick={handleToggleDuty}
            disabled={togglingDuty}
          >
            {togglingDuty
              ? 'Updating…'
              : profile.is_online
              ? 'Go offline'
              : 'Go online'}
          </button>
        </section>

        {/* Global Alerts */}
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

        {/* Navigation Tabs */}
        <div className="tab-bar" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'deliveries'}
            className={`tab-btn ${activeTab === 'deliveries' ? 'active' : ''}`}
            onClick={() => setActiveTab('deliveries')}
          >
            <Icon name="box" size={18} />
            <span>Deliveries</span>
            {available.length > 0 ? (
              <span className="tab-pill">{available.length}</span>
            ) : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'earnings'}
            className={`tab-btn ${activeTab === 'earnings' ? 'active' : ''}`}
            onClick={() => setActiveTab('earnings')}
          >
            <Icon name="money" size={18} />
            <span>Earnings</span>
          </button>
        </div>

        {/* Tab 1: Deliveries */}
        {activeTab === 'deliveries' ? (
          <>
            {/* Quick summary strip */}
            <section className="earnings-grid" aria-label="Deliveries summary">
              <div className="card earnings-card">
                <span className="earnings-label">Completed</span>
                <span className="earnings-value">{earningsStats.all.count}</span>
              </div>
              <div className="card earnings-card">
                <span className="earnings-label">Active</span>
                <span className="earnings-value">{active.length}</span>
              </div>
              <div className="card earnings-card">
                <span className="earnings-label">Available</span>
                <span className="earnings-value">{sortedAvailable.length}</span>
              </div>
            </section>

            {/* Active deliveries section */}
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
                            onClick={() => openOtpModal(d, 'picked')}
                          >
                            Mark picked up
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={busyId === id}
                            onClick={() => openOtpModal(d, 'delivered')}
                          >
                            Mark delivered
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </section>
            ) : null}

            {/* Available requests section */}
            <section>
              <div className="section-head">
                <h2 className="section-title">Available requests</h2>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => loadDeliveries('refresh')}
                  disabled={refreshing}
                >
                  {refreshing ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>

              {initialLoading ? (
                <div className="screen-center">
                  <div className="spinner" aria-label="Loading deliveries" />
                </div>
              ) : !profile.is_online && active.length === 0 && sortedAvailable.length === 0 ? (
                <div className="card empty-state">
                  <div className="empty-icon-wrap">
                    <Icon name="scooter" size={32} />
                  </div>
                  <p>You&apos;re offline — go online to receive requests.</p>
                  <p className="muted tiny">Switch your duty toggle above to start receiving order dispatches.</p>
                </div>
              ) : sortedAvailable.length === 0 ? (
                <div className="card empty-state">
                  <p>No delivery requests right now.</p>
                  <p className="muted tiny">New requests from nearby shops will appear here automatically.</p>
                </div>
              ) : (
                sortedAvailable.map((d, i) => {
                  const id = getId(d);
                  const distance = num(d.distance_km ?? d.distance);
                  const fee = num(d.delivery_fee);

                  return (
                    <article className="card delivery-card" key={id ?? `req-${i}`}>
                      <header className="delivery-head">
                        <strong>{getShopName(d)}</strong>
                        {distance !== null ? (
                          <span className="badge badge-amber">{distance.toFixed(1)} km</span>
                        ) : null}
                      </header>
                      {getOrderLabel(d) ? <p className="muted tiny">Order {getOrderLabel(d)}</p> : null}
                      <Route pickup={getPickup(d)} drop={getDrop(d)} masked />
                      <div className="delivery-foot">
                        <div className="fee-info">
                          {fee !== null ? (
                            <span className="fee">₹{fee.toFixed(2)}</span>
                          ) : (
                            <span className="muted tiny">Payout: to be confirmed</span>
                          )}
                        </div>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busyId === id}
                          onClick={() => handleAcceptClick(d)}
                        >
                          {busyId === id ? 'Accepting…' : 'Accept'}
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </section>
          </>
        ) : (
          /* Tab 2: Earnings */
          <section className="earnings-section">
            <h2 className="section-title">Delivery Earnings & Ledger</h2>

            {/* Delivered counts & fee summary cards */}
            <div className="earnings-grid" aria-label="Earnings summary">
              <div className="card earnings-card">
                <span className="earnings-label">Today</span>
                <span className="earnings-value">
                  {earningsStats.today.fee !== null ? `₹${earningsStats.today.fee.toFixed(2)}` : '—'}
                </span>
                <span className="muted tiny">{earningsStats.today.count} delivered</span>
              </div>
              <div className="card earnings-card">
                <span className="earnings-label">This Week</span>
                <span className="earnings-value">
                  {earningsStats.week.fee !== null ? `₹${earningsStats.week.fee.toFixed(2)}` : '—'}
                </span>
                <span className="muted tiny">{earningsStats.week.count} delivered</span>
              </div>
              <div className="card earnings-card">
                <span className="earnings-label">All-Time</span>
                <span className="earnings-value">
                  {earningsStats.all.fee !== null ? `₹${earningsStats.all.fee.toFixed(2)}` : '—'}
                </span>
                <span className="muted tiny">{earningsStats.all.count} delivered</span>
              </div>
            </div>

            {/* Honest state banner */}
            <div className="card ledger-notice-card">
              <div className="ledger-notice-icon">
                <Icon name="receipt" size={24} />
              </div>
              <div>
                <strong>Payout structure</strong>
                <p className="muted tiny">
                  Per-delivery payout structure is being finalized by the platform. Your earnings will appear here
                  automatically once payouts begin.
                </p>
              </div>
            </div>

            {/* Delivered Orders Ledger */}
            <div className="section-head">
              <h3 className="section-title">Delivered Orders ({earningsStats.delivered.length})</h3>
            </div>

            {earningsStats.delivered.length === 0 ? (
              <div className="card empty-state">
                <p>No delivered orders yet.</p>
                <p className="muted tiny">Completed orders will appear in your ledger here.</p>
              </div>
            ) : (
              <div className="ledger-list">
                {earningsStats.delivered.map((d, idx) => {
                  const id = getId(d);
                  const fee = num(d.delivery_fee);
                  const rawDate = d.updated_at || d.created_at;
                  const dateStr = rawDate ? new Date(rawDate).toLocaleDateString() : '—';

                  return (
                    <article className="card ledger-item" key={id ?? `delivered-${idx}`}>
                      <div className="ledger-item-main">
                        <strong>{getShopName(d)}</strong>
                        <span className="muted tiny">
                          {getOrderLabel(d) ? `Order ${getOrderLabel(d)} • ` : ''}
                          {dateStr}
                        </span>
                      </div>
                      <div className="ledger-item-amount">
                        {fee !== null ? (
                          <span className="fee">₹{fee.toFixed(2)}</span>
                        ) : (
                          <span className="muted tiny">Payout: to be confirmed</span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>

      {/* OTP Verification Modal */}
      <OtpModal
        isOpen={otpModal.isOpen}
        type={otpModal.type}
        onSubmit={handleOtpSubmit}
        onClose={closeOtpModal}
      />

      {/* First-Day Training Primer Modal */}
      <TrainingPrimer
        isOpen={showPrimer}
        onComplete={handleCompleteTraining}
        onClose={() => {
          setShowPrimer(false);
          setPendingAcceptDelivery(null);
        }}
      />
    </div>
  );
}
