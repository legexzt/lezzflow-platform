import { useCallback, useEffect, useMemo, useState } from 'react';
import Alert from '../components/Alert';
import Header from '../components/Header';
import Icon from '../components/Icon';
import OtpModal from '../components/OtpModal';
import TrainingPrimer from '../components/TrainingPrimer';
import { useLang } from '../i18n.jsx';
import {
  acceptDelivery,
  addTripNote,
  cancelTrip,
  claimReferral,
  fetchDeliveryRequests,
  fetchMyDisputes,
  fetchMyProfile,
  fetchMyReferrals,
  fetchPartnerConfig,
  fetchRecap,
  fetchReliability,
  openDispute,
  sendSos,
  updateDeliveryStatus,
  updateMyProfile,
} from '../api';
import {
  cacheTrips,
  enqueueOp,
  flushOutbox,
  getCachedTrips,
  loadChecklist,
  outboxCount,
  saveChecklist,
} from '../utils/offlineQueue';

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

function getShopId(d) {
  return d.shop_id ?? d.shop?.id ?? null;
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

function getOrderStatus(d) {
  return String(d.order_status ?? '').toLowerCase();
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
  const { t } = useLang();
  const [deliveries, setDeliveries] = useState([]);
  const [profile, setProfile] = useState({ is_online: false, training_completed: false });
  const [partnerConfig, setPartnerConfig] = useState(null);
  const [referralInfo, setReferralInfo] = useState({ my_code: '', referrals: [] });
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingDuty, setTogglingDuty] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [batchBusy, setBatchBusy] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // UI state
  const [activeTab, setActiveTab] = useState('deliveries');
  const [otpModal, setOtpModal] = useState({ isOpen: false, type: null, delivery: null });
  const [showPrimer, setShowPrimer] = useState(false);
  const [pendingAcceptDelivery, setPendingAcceptDelivery] = useState(null);

  // SOS sheet state
  const [showSos, setShowSos] = useState(false);
  const [sosNote, setSosNote] = useState('');
  const [sosSending, setSosSending] = useState(false);

  // Referral claim state
  const [claimCode, setClaimCode] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [copied, setCopied] = useState(false);

  // Cycle-3 state
  const [disputes, setDisputes] = useState([]);
  const [reliability, setReliability] = useState(null);
  const [recap, setRecap] = useState(null);
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  const [pendingOps, setPendingOps] = useState(0);
  const [chipBusy, setChipBusy] = useState(null);
  const [sentChips, setSentChips] = useState({});
  const [cancellingId, setCancellingId] = useState(null);
  const [disputeFor, setDisputeFor] = useState(null);
  const [disputeNote, setDisputeNote] = useState('');
  const [disputeSending, setDisputeSending] = useState(false);
  const [checklist, setChecklist] = useState(() => loadChecklist());
  const [showChecklist, setShowChecklist] = useState(false);

  const TRIP_CHIPS = useMemo(
    () => [
      { id: 'arrived_at_shop', labelKey: 'chipArrived' },
      { id: 'waiting_for_packing', labelKey: 'chipWaiting' },
      { id: 'contacted_customer', labelKey: 'chipContacted' },
    ],
    [],
  );

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

  const loadDeliveries = useCallback(
    async (mode = 'refresh') => {
      if (mode === 'initial') setInitialLoading(true);
      else setRefreshing(true);
      try {
        const data = await fetchDeliveryRequests();
        const list = asArray(data);
        setDeliveries(list);
        // Cache active trips so the trip screen stays readable offline
        cacheTrips(list.filter((d) => ['accepted', 'picked'].includes(getStatus(d))));
        setError('');
      } catch (e) {
        // Offline: fall back to the last synced trip snapshot
        const cached = getCachedTrips();
        if (cached && cached.length > 0) {
          setDeliveries((prev) => (prev.length > 0 ? prev : cached));
          setError('');
        } else {
          setError(e.friendlyMessage || t('couldNotLoad'));
        }
      }
      if (mode === 'initial') setInitialLoading(false);
      else setRefreshing(false);
    },
    [t],
  );

  const loadConfig = useCallback(async () => {
    try {
      const data = await fetchPartnerConfig();
      setPartnerConfig(data);
    } catch {
      // Non-fatal; fee/referral cards fall back to honest "not configured" states
    }
  }, []);

  const loadReferrals = useCallback(async () => {
    try {
      const data = await fetchMyReferrals();
      setReferralInfo({ my_code: data.my_code || '', referrals: asArray(data.referrals) });
    } catch {
      // Non-fatal
    }
  }, []);

  // Cycle-3 loaders (all non-fatal; cards render honest empty states)
  const loadDisputes = useCallback(async () => {
    try {
      setDisputes(asArray(await fetchMyDisputes()));
    } catch {
      // Non-fatal
    }
  }, []);

  const loadReliability = useCallback(async () => {
    try {
      setReliability(await fetchReliability());
    } catch {
      // Non-fatal
    }
  }, []);

  const loadRecap = useCallback(async () => {
    try {
      setRecap(await fetchRecap());
    } catch {
      // Non-fatal
    }
  }, []);

  const syncOutbox = useCallback(async () => {
    const { done, failed } = await flushOutbox({
      status: (op) => updateDeliveryStatus(op.requestId, op.status, op.otp),
      note: (op) => addTripNote(op.requestId, op.chip),
    });
    setPendingOps(outboxCount());
    if (done > 0) {
      setNotice(t('opsSynced', { count: done }));
      await loadDeliveries('refresh');
    }
    if (failed > 0) {
      setError(t('opsFailed', { count: failed }));
    }
  }, [loadDeliveries, t]);

  const refreshAll = useCallback(
    async (mode = 'refresh') => {
      await Promise.all([loadDeliveries(mode), loadProfile(), loadDisputes(), loadReliability(), loadRecap()]);
    },
    [loadDeliveries, loadProfile, loadDisputes, loadReliability, loadRecap],
  );

  useEffect(() => {
    refreshAll('initial');
    loadConfig();
    loadReferrals();
    setPendingOps(outboxCount());
    const timer = setInterval(() => refreshAll('refresh'), 30000);
    return () => clearInterval(timer);
  }, [refreshAll, loadConfig, loadReferrals]);

  // Offline / reconnect: queue trip updates offline, sync on reconnect
  useEffect(() => {
    const onOnline = () => {
      setIsOffline(false);
      syncOutbox();
    };
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [syncOutbox]);

  const active = deliveries.filter((d) => ['accepted', 'picked'].includes(getStatus(d)));
  const available = deliveries.filter((d) => !INACTIVE.has(getStatus(d)));
  const cancelledTrips = useMemo(
    () => deliveries.filter((d) => getStatus(d) === 'cancelled'),
    [deliveries],
  );

  const disputeByRequest = useMemo(() => {
    const map = {};
    for (const d of disputes) {
      const rid = d.delivery_request_id ?? d.request_id;
      if (rid) map[rid] = d;
    }
    return map;
  }, [disputes]);

  // Nearest-first sorting for available requests (NULLs last)
  const sortedAvailable = useMemo(() => {
    return [...available].sort((a, b) => {
      const da = num(a.distance_km ?? a.distance);
      const db = num(b.distance_km ?? b.distance);
      if (da !== null && db !== null) return da - db;
      if (da === null && db !== null) return -1;
      if (da === null && db !== null) return 1;
      return 0;
    });
  }, [available]);

  // One-shop batching: group available requests by shop
  const batchedAvailable = useMemo(() => {
    const groups = new Map();
    for (const d of sortedAvailable) {
      const key = getShopId(d) ?? `solo-${getId(d)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(d);
    }
    return [...groups.values()];
  }, [sortedAvailable]);

  // Group active deliveries by shop for the trip view
  const activeByShop = useMemo(() => {
    const groups = new Map();
    for (const d of active) {
      const key = getShopId(d) ?? `solo-${getId(d)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(d);
    }
    return [...groups.values()];
  }, [active]);

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

  // Delivery Acceptance (single)
  async function doAccept(d) {
    const id = getId(d);
    if (!id) return false;
    setBusyId(id);
    setNotice('');
    setError('');
    try {
      await acceptDelivery(id);
      return true;
    } catch (e) {
      setError(e.friendlyMessage || t('acceptFailed'));
      return false;
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
    const ok = await doAccept(d);
    if (ok) {
      setNotice(t('deliveryAccepted'));
      await loadDeliveries('refresh');
    }
  }

  // Batch accept: one decision, sequential accepts, honest partial-failure report
  async function handleAcceptBatch(batch) {
    if (!profile.training_completed) {
      setPendingAcceptDelivery(batch[0]);
      setShowPrimer(true);
      return;
    }
    const key = batch.map(getId).join('-');
    setBatchBusy(key);
    setNotice('');
    setError('');
    let okCount = 0;
    const failed = [];
    for (const d of batch) {
      const ok = await doAccept(d);
      if (ok) okCount++;
      else failed.push(getOrderLabel(d) || getId(d));
    }
    if (failed.length === 0) {
      setNotice(t('deliveryAccepted'));
    } else {
      setError(`${okCount} ${t('batchPartial')}: ${failed.join(', ')}`);
    }
    setBatchBusy(null);
    await loadDeliveries('refresh');
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
        setNotice(t('deliveryAccepted'));
        await loadDeliveries('refresh');
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

    await submitTripStatus(id, type, otp);
    setNotice(type === 'picked' ? t('pickedNotice') : t('deliveredNotice'));
    await loadDeliveries('refresh');
  }

  // Offline-aware trip status submit: queue when offline, sync on reconnect.
  // Server stays authoritative — a stale queued op fails with the server error.
  async function submitTripStatus(id, status, otp) {
    if (isOffline) {
      enqueueOp({ kind: 'status', requestId: id, status, otp });
      setPendingOps(outboxCount());
      setNotice(t('queuedSync'));
      return;
    }
    try {
      await updateDeliveryStatus(id, status, otp);
    } catch (e) {
      if (!navigator.onLine) {
        enqueueOp({ kind: 'status', requestId: id, status, otp });
        setPendingOps(outboxCount());
        setNotice(t('queuedSync'));
        return;
      }
      throw e;
    }
  }

  // Quick status chips — one tap, no typing
  async function handleChip(id, chip) {
    if (!id || chipBusy) return;
    setChipBusy(`${id}-${chip}`);
    setError('');
    try {
      if (isOffline) {
        enqueueOp({ kind: 'note', requestId: id, chip });
        setPendingOps(outboxCount());
        setSentChips((prev) => ({ ...prev, [`${id}-${chip}`]: true }));
        setNotice(t('queuedSync'));
        return;
      }
      try {
        await addTripNote(id, chip);
      } catch (e) {
        if (!navigator.onLine) {
          enqueueOp({ kind: 'note', requestId: id, chip });
          setPendingOps(outboxCount());
          setNotice(t('queuedSync'));
          return;
        }
        throw e;
      }
      setSentChips((prev) => ({ ...prev, [`${id}-${chip}`]: true }));
      setNotice(t('chipSent'));
    } catch (e) {
      setError(e.friendlyMessage || t('chipFailed'));
    } finally {
      setChipBusy(null);
    }
  }

  // Partner-initiated cancel of an accepted trip (bike issue, emergency…)
  async function handleCancelTrip(d) {
    const id = getId(d);
    if (!id || cancellingId) return;
    if (!window.confirm(t('cancelTripConfirm'))) return;
    setCancellingId(id);
    setError('');
    try {
      await cancelTrip(id);
      setNotice(t('tripCancelled'));
      await loadDeliveries('refresh');
    } catch (e) {
      setError(e.friendlyMessage || t('cancelFailed'));
    } finally {
      setCancellingId(null);
    }
  }

  // "I already travelled" dispute on an order-cancelled trip
  async function handleSubmitDispute(requestId) {
    if (!requestId || disputeSending) return;
    setDisputeSending(true);
    setError('');
    try {
      await openDispute(requestId, disputeNote.trim());
      setNotice(t('disputeSent'));
      setDisputeFor(null);
      setDisputeNote('');
      await loadDisputes();
    } catch (e) {
      setError(e.friendlyMessage || t('disputeFailed'));
    } finally {
      setDisputeSending(false);
    }
  }

  function toggleChecklistItem(key) {
    setChecklist((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveChecklist(next);
      return next;
    });
  }

  // SOS
  function getActiveDeliveryForSos() {
    return active.length > 0 ? active[0] : null;
  }

  async function handleSendSos() {
    setSosSending(true);
    setError('');
    const payload = { note: sosNote.trim() || undefined };
    const ad = getActiveDeliveryForSos();
    if (ad) payload.delivery_request_id = getId(ad);
    try {
      const pos = await new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
          timeout: 8000,
          maximumAge: 60000,
        });
      });
      if (pos && pos.coords) {
        payload.lat = pos.coords.latitude;
        payload.lng = pos.coords.longitude;
      }
      await sendSos(payload);
      setNotice(t('sosSent'));
      setShowSos(false);
      setSosNote('');
    } catch (e) {
      setError(e.friendlyMessage || t('sosFailed'));
    } finally {
      setSosSending(false);
    }
  }

  // Referral
  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(referralInfo.my_code);
    } catch {
      // clipboard may be unavailable; selection fallback is the visible code
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleShareCode() {
    const text = `Join LezzFlow as a delivery partner with my code ${referralInfo.my_code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: t('referTitle'), text });
      } else {
        await handleCopyCode();
      }
    } catch {
      // user dismissed share sheet
    }
  }

  async function handleClaim() {
    const code = claimCode.trim();
    if (!code) return;
    setClaiming(true);
    setError('');
    try {
      await claimReferral(code);
      setNotice(t('referClaimed'));
      setClaimCode('');
      await loadReferrals();
    } catch (e) {
      setError(e.friendlyMessage || t('referClaimFailed'));
    } finally {
      setClaiming(false);
    }
  }

  function batchFee(batch) {
    let total = 0;
    for (const d of batch) {
      const f = num(d.delivery_fee);
      if (f === null) return null;
      total += f;
    }
    return total;
  }

  function Route({ pickup, drop, masked }) {
    return (
      <div className="delivery-route">
        <div>
          <span className="route-dot route-dot-pickup" />
          <div>
            <small>{t('pickup')}</small>
            <p>{pickup || (masked ? 'Shared after acceptance' : '—')}</p>
          </div>
        </div>
        <div>
          <span className="route-dot route-dot-drop" />
          <div>
            <small>{t('drop')}</small>
            <p>{drop || (masked ? 'Shared after acceptance' : '—')}</p>
          </div>
        </div>
      </div>
    );
  }

  function PackBadge({ orderStatus }) {
    // Real seller-emitted order state -> honest partner-facing copy
    if (['packed', 'assigned'].includes(orderStatus)) {
      return <span className="badge badge-green">{t('readyPickup')}</span>;
    }
    return <span className="badge badge-amber">{t('shopPacking')}</span>;
  }

  function AvailableCard({ d }) {
    const id = getId(d);
    const distance = num(d.distance_km ?? d.distance);
    const fee = num(d.delivery_fee);
    return (
      <article className="card delivery-card">
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
              <span className="muted tiny">{t('payoutTbd')}</span>
            )}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busyId === id}
            onClick={() => handleAcceptClick(d)}
          >
            {busyId === id ? t('accepting') : t('accept')}
          </button>
        </div>
      </article>
    );
  }

  function BatchCard({ batch }) {
    const key = batch.map(getId).join('-');
    const fee = batchFee(batch);
    const shopName = getShopName(batch[0]);
    return (
      <article className="card delivery-card delivery-batch">
        <header className="delivery-head">
          <strong>{shopName}</strong>
          <span className="badge badge-blue">
            {batch.length} {t('orders')} · 1 {t('pickup')} · {batch.length} {t('drops')}
          </span>
        </header>
        <ul className="batch-drop-list">
          {batch.map((d, i) => (
            <li key={getId(d) ?? i}>
              <span className="batch-drop-num">{i + 1}</span>
              <span className="muted tiny">
                {getOrderLabel(d)} · {getDrop(d) || '—'}
              </span>
            </li>
          ))}
        </ul>
        <div className="delivery-foot">
          <div className="fee-info">
            {fee !== null ? (
              <span className="fee">
                ₹{fee.toFixed(2)} <small className="muted tiny">{t('totalFee')}</small>
              </span>
            ) : (
              <span className="muted tiny">{t('payoutTbd')}</span>
            )}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={batchBusy === key}
            onClick={() => handleAcceptBatch(batch)}
          >
            {batchBusy === key ? t('accepting') : t('acceptBatch')}
          </button>
        </div>
      </article>
    );
  }

  const feeConfigured =
    partnerConfig &&
    partnerConfig.delivery_base_fee !== null &&
    partnerConfig.delivery_per_km_fee !== null;
  const referralLive =
    partnerConfig &&
    partnerConfig.partner_referral_enabled &&
    partnerConfig.partner_referral_bonus !== null;

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
                  {profile.is_online ? t('dutyOnline') : t('dutyOffline')}
                </strong>
              </div>
              <p className="duty-subtext muted tiny">
                {profile.is_online ? t('dutyOnlineSub') : t('dutyOfflineSub')}
              </p>
            </div>
          </div>
          <button
            type="button"
            className={`btn ${profile.is_online ? 'btn-ghost' : 'btn-primary'} btn-sm duty-toggle-btn`}
            onClick={handleToggleDuty}
            disabled={togglingDuty}
          >
            {togglingDuty ? t('updating') : profile.is_online ? t('goOffline') : t('goOnline')}
          </button>
        </section>

        {/* Duty-on checklist — quick pre-trip sanity check */}
        {profile.is_online ? (
          <section className="card checklist-card">
            <button
              type="button"
              className="checklist-head"
              onClick={() => setShowChecklist((v) => !v)}
              aria-expanded={showChecklist}
            >
              <Icon name="check" size={18} />
              <strong>{t('dutyChecklist')}</strong>
              <span className="muted tiny">
                {Object.values(checklist).filter(Boolean).length}/4
              </span>
            </button>
            {showChecklist ? (
              <ul className="checklist">
                {[
                  { key: 'phone', labelKey: 'checkPhone' },
                  { key: 'bag', labelKey: 'checkBag' },
                  { key: 'fuel', labelKey: 'checkFuel' },
                  { key: 'idcard', labelKey: 'checkId' },
                ].map((item) => (
                  <li key={item.key}>
                    <label className="checklist-item">
                      <input
                        type="checkbox"
                        checked={!!checklist[item.key]}
                        onChange={() => toggleChecklistItem(item.key)}
                      />
                      <span>{t(item.labelKey)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

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

        {/* Offline banner — trip screen stays readable, updates queue */}
        {isOffline ? (
          <div className="card offline-banner" role="status">
            <Icon name="wifiOff" size={18} />
            <div>
              <strong>{t('offlineTitle')}</strong>
              <p className="muted tiny">
                {pendingOps > 0 ? t('offlinePending', { count: pendingOps }) : t('offlineSub')}
              </p>
            </div>
          </div>
        ) : pendingOps > 0 ? (
          <div className="card offline-banner" role="status">
            <Icon name="sync" size={18} />
            <div>
              <strong>{t('pendingSync', { count: pendingOps })}</strong>
              <p className="muted tiny">{t('pendingSyncSub')}</p>
            </div>
          </div>
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
            <span>{t('tabDeliveries')}</span>
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
            <span>{t('tabEarnings')}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'refer'}
            className={`tab-btn ${activeTab === 'refer' ? 'active' : ''}`}
            onClick={() => setActiveTab('refer')}
          >
            <Icon name="userPlus" size={18} />
            <span>{t('tabRefer')}</span>
          </button>
        </div>

        {/* Tab 1: Deliveries */}
        {activeTab === 'deliveries' ? (
          <>
            {/* Quick summary strip */}
            <section className="earnings-grid" aria-label="Deliveries summary">
              <div className="card earnings-card">
                <span className="earnings-label">{t('completed')}</span>
                <span className="earnings-value">{earningsStats.all.count}</span>
              </div>
              <div className="card earnings-card">
                <span className="earnings-label">{t('active')}</span>
                <span className="earnings-value">{active.length}</span>
              </div>
              <div className="card earnings-card">
                <span className="earnings-label">{t('available')}</span>
                <span className="earnings-value">{sortedAvailable.length}</span>
              </div>
            </section>

            {/* Active deliveries — grouped by shop with pack status + drop checklist */}
            {activeByShop.length > 0 ? (
              <section>
                <h2 className="section-title">{t('activeDelivery')}</h2>
                {activeByShop.map((group, gi) => (
                  <article className="card delivery-card delivery-active" key={`ag-${gi}`}>
                    <header className="delivery-head">
                      <strong>{getShopName(group[0])}</strong>
                      {group.length > 1 ? (
                        <span className="badge badge-blue">
                          {group.length} {t('drops')}
                        </span>
                      ) : null}
                    </header>
                    <ol className="trip-checklist">
                      {group.map((d, i) => {
                        const id = getId(d);
                        const s = getStatus(d);
                        return (
                          <li key={id ?? `ad-${i}`} className="trip-stop">
                            <span className="batch-drop-num">{i + 1}</span>
                            <div className="trip-stop-main">
                              <div className="trip-stop-head">
                                {getOrderLabel(d) ? (
                                  <span className="muted tiny">
                                    {t('orderCode')}: <strong>{getOrderLabel(d)}</strong>
                                  </span>
                                ) : null}
                                <span className={`badge ${s === 'picked' ? 'badge-blue' : 'badge-green'}`}>
                                  {s}
                                </span>
                                {s === 'accepted' ? <PackBadge orderStatus={getOrderStatus(d)} /> : null}
                              </div>
                              <Route pickup={i === 0 ? getPickup(d) : ''} drop={getDrop(d)} masked={false} />
                              {/* Quick status chips — one tap, no typing */}
                              <div className="chip-row" role="group" aria-label={t('tripUpdate')}>
                                {TRIP_CHIPS.map((chip) => {
                                  const key = `${id}-${chip.id}`;
                                  const sent = sentChips[key];
                                  return (
                                    <button
                                      key={chip.id}
                                      type="button"
                                      className={`chip ${sent ? 'chip-sent' : ''}`}
                                      disabled={chipBusy === key || sent}
                                      onClick={() => handleChip(id, chip.id)}
                                    >
                                      {chipBusy === key ? '…' : sent ? `✓ ${t(chip.labelKey)}` : t(chip.labelKey)}
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="delivery-foot">
                                {s === 'accepted' ? (
                                  <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    disabled={busyId === id}
                                    onClick={() => openOtpModal(d, 'picked')}
                                  >
                                    {t('markPicked')}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    disabled={busyId === id}
                                    onClick={() => openOtpModal(d, 'delivered')}
                                  >
                                    {t('markDelivered')}
                                  </button>
                                )}
                                {s === 'accepted' ? (
                                  <button
                                    type="button"
                                    className="btn-link danger-link"
                                    disabled={cancellingId === id}
                                    onClick={() => handleCancelTrip(d)}
                                  >
                                    {cancellingId === id ? t('cancelling') : t('cancelTrip')}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </article>
                ))}
              </section>
            ) : null}

            {/* Available requests — one-shop batching */}
            <section>
              <div className="section-head">
                <h2 className="section-title">{t('availableRequests')}</h2>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => loadDeliveries('refresh')}
                  disabled={refreshing}
                >
                  {refreshing ? t('refreshing') : t('refresh')}
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
                  <p>{t('offlineEmpty')}</p>
                  <p className="muted tiny">{t('offlineEmptySub')}</p>
                </div>
              ) : sortedAvailable.length === 0 ? (
                <div className="card empty-state">
                  <p>{t('noRequests')}</p>
                  <p className="muted tiny">{t('noRequestsSub')}</p>
                </div>
              ) : (
                batchedAvailable.map((group, gi) =>
                  group.length > 1 ? (
                    <BatchCard key={`batch-${gi}`} batch={group} />
                  ) : (
                    <AvailableCard key={getId(group[0]) ?? `req-${gi}`} d={group[0]} />
                  ),
                )
              )}
            </section>

            {/* Cancelled trips — stays visible, with "I already travelled" dispute */}
            {cancelledTrips.length > 0 ? (
              <section>
                <h2 className="section-title">{t('cancelledTrips')}</h2>
                {cancelledTrips.map((d, idx) => {
                  const id = getId(d);
                  const byOrder = d.cancelled_by === 'order';
                  const dispute = disputeByRequest[id];
                  return (
                    <article className="card delivery-card delivery-cancelled" key={id ?? `cx-${idx}`}>
                      <div className="trip-stop-head">
                        {getOrderLabel(d) ? (
                          <span className="muted tiny">
                            {t('orderCode')}: <strong>{getOrderLabel(d)}</strong>
                          </span>
                        ) : null}
                        <span className="badge badge-grey">{t('cancelled')}</span>
                      </div>
                      <p className="muted tiny">
                        {getShopName(d)} •{' '}
                        {byOrder ? t('cancelledByOrder') : t('cancelledByYou')}
                      </p>
                      {byOrder ? (
                        dispute ? (
                          <div className="dispute-status">
                            <span
                              className={`badge ${
                                dispute.status === 'approved'
                                  ? 'badge-green'
                                  : dispute.status === 'rejected'
                                    ? 'badge-grey'
                                    : 'badge-blue'
                              }`}
                            >
                              {t(`dispute${dispute.status[0].toUpperCase()}${dispute.status.slice(1)}`)}
                            </span>
                            {dispute.status === 'approved' && dispute.goodwill_amount ? (
                              <span className="muted tiny">
                                {' '}
                                • {t('goodwillAwarded', { amount: Number(dispute.goodwill_amount).toFixed(0) })}
                              </span>
                            ) : null}
                          </div>
                        ) : disputeFor === id ? (
                          <div className="dispute-form">
                            <textarea
                              className="input"
                              rows={2}
                              placeholder={t('disputePlaceholder')}
                              value={disputeNote}
                              onChange={(e) => setDisputeNote(e.target.value)}
                            />
                            <div className="delivery-foot">
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                disabled={disputeSending}
                                onClick={() => handleSubmitDispute(id)}
                              >
                                {disputeSending ? t('sending') : t('disputeSubmit')}
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => {
                                  setDisputeFor(null);
                                  setDisputeNote('');
                                }}
                              >
                                {t('cancel')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setDisputeFor(id)}
                          >
                            {t('disputeCta')}
                          </button>
                        )
                      ) : null}
                    </article>
                  );
                })}
              </section>
            ) : null}
          </>
        ) : null}

        {/* Tab 2: Earnings */}
        {activeTab === 'earnings' ? (
          <section className="earnings-section">
            <h2 className="section-title">{t('earningsTitle')}</h2>

            {/* Delivered counts & fee summary cards */}
            <div className="earnings-grid" aria-label="Earnings summary">
              <div className="card earnings-card">
                <span className="earnings-label">{t('today')}</span>
                <span className="earnings-value">
                  {earningsStats.today.fee !== null ? `₹${earningsStats.today.fee.toFixed(2)}` : '—'}
                </span>
                <span className="muted tiny">
                  {earningsStats.today.count} {t('delivered')}
                </span>
              </div>
              <div className="card earnings-card">
                <span className="earnings-label">{t('thisWeek')}</span>
                <span className="earnings-value">
                  {earningsStats.week.fee !== null ? `₹${earningsStats.week.fee.toFixed(2)}` : '—'}
                </span>
                <span className="muted tiny">
                  {earningsStats.week.count} {t('delivered')}
                </span>
              </div>
              <div className="card earnings-card">
                <span className="earnings-label">{t('allTime')}</span>
                <span className="earnings-value">
                  {earningsStats.all.fee !== null ? `₹${earningsStats.all.fee.toFixed(2)}` : '—'}
                </span>
                <span className="muted tiny">
                  {earningsStats.all.count} {t('delivered')}
                </span>
              </div>
            </div>

            {/* End-of-day recap — real ledger rows only */}
            <div className="card recap-card">
              <div className="ledger-notice-icon">
                <Icon name="chart" size={24} />
              </div>
              <div className="recap-body">
                <strong>{t('todayRecap')}</strong>
                {recap ? (
                  <p className="muted tiny">
                    {t('tripsToday', { count: recap.trips })}
                    {recap.earnings !== null && recap.earnings !== undefined
                      ? ` • ₹${Number(recap.earnings).toFixed(2)}`
                      : ` • ${t('earningsUnavailable')}`}
                  </p>
                ) : (
                  <p className="muted tiny">{t('recapLoading')}</p>
                )}
              </div>
            </div>

            {/* Reliability — backend-verified events only, partner/admin only */}
            <div className="card recap-card">
              <div className="ledger-notice-icon">
                <Icon name="check" size={24} />
              </div>
              <div className="recap-body">
                <strong>{t('reliabilityTitle')}</strong>
                {reliability ? (
                  reliability.score === null || reliability.score === undefined ? (
                    <p className="muted tiny">{reliability.note || t('notEnoughTrips')}</p>
                  ) : (
                    <>
                      <p className="reliability-score">
                        {reliability.score}
                        <span className="muted tiny">/100</span>
                      </p>
                      <p className="muted tiny">
                        {t('reliabilityDetail', {
                          delivered: reliability.delivered,
                          trips: reliability.trips,
                          ontime:
                            reliability.ontime_pickup_pct !== null &&
                            reliability.ontime_pickup_pct !== undefined
                              ? `${reliability.ontime_pickup_pct}%`
                              : '—',
                        })}
                      </p>
                    </>
                  )
                ) : (
                  <p className="muted tiny">{t('recapLoading')}</p>
                )}
                <p className="muted tiny">{t('reliabilityPrivate')}</p>
              </div>
            </div>

            {/* Fee formula card — real configured values only */}
            <div className="card ledger-notice-card">
              <div className="ledger-notice-icon">
                <Icon name="receipt" size={24} />
              </div>
              <div>
                <strong>{feeConfigured ? t('feeHowItWorks') : t('payoutStructure')}</strong>
                {feeConfigured ? (
                  <p className="muted tiny">
                    ₹{Number(partnerConfig.delivery_base_fee).toFixed(2)} {t('feeBase')} + ₹
                    {Number(partnerConfig.delivery_per_km_fee).toFixed(2)}
                    {t('feePerKm')}
                  </p>
                ) : (
                  <p className="muted tiny">{t('payoutStructureBody')}</p>
                )}
              </div>
            </div>

            {/* Weekly payout honesty copy */}
            <div className="card ledger-notice-card">
              <div className="ledger-notice-icon">
                <Icon name="money" size={24} />
              </div>
              <div>
                <strong>{t('weeklyPayout')}</strong>
                <p className="muted tiny">{t('weeklyPayoutBody')}</p>
              </div>
            </div>

            {/* Delivered Orders Ledger */}
            <div className="section-head">
              <h3 className="section-title">
                {t('deliveredOrders')} ({earningsStats.delivered.length})
              </h3>
            </div>

            {earningsStats.delivered.length === 0 ? (
              <div className="card empty-state">
                <p>{t('noDelivered')}</p>
                <p className="muted tiny">{t('noDeliveredSub')}</p>
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
                          <span className="muted tiny">{t('payoutTbd')}</span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ) : null}

        {/* Tab 3: Refer */}
        {activeTab === 'refer' ? (
          <section className="earnings-section">
            <h2 className="section-title">{t('referTitle')}</h2>

            <div className="card">
              <span className="earnings-label">{t('referCode')}</span>
              <div className="refer-code-row">
                <strong className="refer-code">{referralInfo.my_code || '—'}</strong>
                <button type="button" className="btn btn-ghost btn-sm" onClick={handleCopyCode}>
                  <Icon name="copy" size={16} /> {copied ? t('copied') : t('copy')}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={handleShareCode}>
                  <Icon name="share" size={16} /> {t('share')}
                </button>
              </div>
              <p className="muted tiny" style={{ marginTop: 8 }}>
                {referralLive
                  ? `₹${Number(partnerConfig.partner_referral_bonus).toFixed(2)} ${t('referTerms')}`
                  : t('referComingSoon')}
              </p>
            </div>

            <div className="card">
              <span className="earnings-label">{t('referHaveCode')}</span>
              <div className="refer-code-row">
                <input
                  type="text"
                  className="refer-input"
                  placeholder="LF-XXXX"
                  value={claimCode}
                  onChange={(e) => setClaimCode(e.target.value.toUpperCase())}
                  maxLength={12}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={claiming || !claimCode.trim()}
                  onClick={handleClaim}
                >
                  {claiming ? t('accepting') : t('referClaim')}
                </button>
              </div>
            </div>

            <div className="section-head">
              <h3 className="section-title">
                {t('referList')} ({referralInfo.referrals.length})
              </h3>
            </div>
            {referralInfo.referrals.length === 0 ? (
              <div className="card empty-state">
                <p>{t('referEmpty')}</p>
              </div>
            ) : (
              <div className="ledger-list">
                {referralInfo.referrals.map((r) => (
                  <article className="card ledger-item" key={r.id}>
                    <div className="ledger-item-main">
                      <strong>{r.referred_name}</strong>
                      <span className="muted tiny">
                        {new Date(r.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="ledger-item-amount">
                      <span
                        className={`badge ${
                          r.status === 'paid'
                            ? 'badge-green'
                            : r.status === 'qualified'
                            ? 'badge-blue'
                            : 'badge-amber'
                        }`}
                      >
                        {t(`status${r.status[0].toUpperCase()}${r.status.slice(1)}`)}
                      </span>
                      {r.bonus_amount !== null && r.bonus_amount !== undefined ? (
                        <span className="fee"> ₹{Number(r.bonus_amount).toFixed(2)}</span>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </main>

      {/* SOS floating action button */}
      <button
        type="button"
        className="sos-fab"
        onClick={() => setShowSos(true)}
        aria-label={t('sosTitle')}
      >
        <Icon name="sos" size={26} />
      </button>

      {/* SOS bottom sheet */}
      {showSos ? (
        <div className="sheet-backdrop" onClick={() => setShowSos(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('sosTitle')}>
            <h3 className="section-title">{t('sosTitle')}</h3>

            {partnerConfig && partnerConfig.partner_support_phone ? (
              <a
                className="btn btn-primary btn-block sos-option"
                href={`tel:${partnerConfig.partner_support_phone}`}
              >
                <Icon name="phone" size={20} /> {t('sosCallSupport')}
              </a>
            ) : (
              <div className="card sos-disabled">
                <Icon name="phone" size={20} />
                <div>
                  <strong>{t('sosCallSupport')}</strong>
                  <p className="muted tiny">{t('supportNotSet')}</p>
                </div>
              </div>
            )}

            <div className="card sos-disabled">
              <Icon name="phone" size={20} />
              <div>
                <strong>{t('sosCallCustomer')}</strong>
                <p className="muted tiny">+91 •••• •• •• — {t('maskedSoon')}</p>
              </div>
            </div>

            <div className="card">
              <span className="earnings-label">{t('sosSendAlert')}</span>
              <textarea
                className="refer-input sos-note"
                placeholder={t('sosNotePh')}
                value={sosNote}
                onChange={(e) => setSosNote(e.target.value)}
                rows={2}
                maxLength={500}
              />
              <div className="sos-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowSos(false)}>
                  {t('cancel')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={sosSending}
                  onClick={handleSendSos}
                >
                  <Icon name="sos" size={18} /> {sosSending ? t('accepting') : t('send')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

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
