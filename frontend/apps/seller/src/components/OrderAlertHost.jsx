/**
 * OrderAlertHost — global new-order alert layer (Item 1)
 * Mounts once in App.jsx. Holds the alert queue, renders the full-screen
 * alert + sticky banner outside all page containers so tab switches never
 * unmount them. Reuses .order-card/.order-items patterns, .chip, .btn,
 * .toast-host (via useToast).
 *
 * Sound: WebAudio beeps (Bell=880Hz, Classic=440Hz, Soft=660Hz) — no binary
 * assets. Vibration: navigator.vibrate([300,120,300,120,600]) repeated while
 * ringing. Offline: lf_pending_actions localStorage queue flushed on 'online'.
 *
 * Practice orders: never increment nav badge, never affect metrics. If a
 * practice alert is in the queue and a real order arrives, real orders are
 * served first (the queue is sorted: real before practice).
 */
import { useEffect, useRef, useState, useCallback, useContext, createContext } from 'react'
import Icon from './Icon.jsx'
import { useToast } from './Toast.jsx'
import api from '../api.js'

// ---- Contexts so children (BottomNav, etc.) can read placed count --------
const AlertCtx = createContext(null)
export function useAlertCtx() { return useContext(AlertCtx) }

// ---- WebAudio beep helper ------------------------------------------------
function playBeep(style = 'bell', duration = 3000) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const freqMap = { bell: 880, classic: 440, soft: 660 }
    const freq = freqMap[style] || 880
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.4, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + duration / 1000)
    return { ctx, stop: () => { try { gain.gain.setValueAtTime(0.001, ctx.currentTime); osc.stop(); } catch (_) {} } }
  } catch (_) {
    return null
  }
}

// ---- Countdown formatter -------------------------------------------------
function fmtCountdown(ms) {
  if (ms <= 0) return null
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// ---- localStorage offline queue ------------------------------------------
const QUEUE_KEY = 'lf_pending_actions'
function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') } catch { return [] }
}
function writeQueue(q) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)) } catch {}
}
function pushQueue(action) {
  const q = readQueue()
  q.push(action)
  writeQueue(q)
}

// ---- Sound-settings localStorage -----------------------------------------
const SOUND_KEY = 'lf_alert_sound'
const VIB_KEY = 'lf_alert_vib'
const STYLE_KEY = 'lf_alert_style'
const PACK_KEY = 'lf_pack_mins'
const PUSH_ASKED_KEY = 'lf_push_asked'
const PUSH_SNOOZE_KEY = 'lf_push_snooze'
const AUDIO_UNLOCKED_KEY = 'lf_audio_unlocked'

function getSetting(key, def) {
  try {
    const v = localStorage.getItem(key)
    if (v === null) return def
    if (v === 'true') return true
    if (v === 'false') return false
    return v
  } catch { return def }
}

function setSetting(key, val) {
  try { localStorage.setItem(key, String(val)) } catch {}
}

// ---- toDate helper -------------------------------------------------------
function toDate(v) {
  if (!v) return null
  if (typeof v === 'string' || typeof v === 'number') return new Date(v)
  if (v._seconds != null) return new Date(v._seconds * 1000)
  if (typeof v.toDate === 'function') return v.toDate()
  return null
}

const DECLINE_REASONS = ['Out of stock', 'Shop closed', 'Too far', 'Other']

// =========================================================================
export default function OrderAlertHost({ children }) {
  const toast = useToast()

  // Alert queue: array of order objects (real first, practice last)
  const [queue, setQueue] = useState([])
  // Current displayed index within queue
  const [qIdx, setQIdx] = useState(0)
  // UI state per queue item: 'alert' | 'packing' | 'decline' | 'error' | 'practice-success' | 'offline'
  const [stage, setStage] = useState('alert')
  const [declReason, setDeclReason] = useState('')
  const [accepting, setAccepting] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [offlineStrip, setOfflineStrip] = useState(false)
  // Banner: 'none' | 'new' | 'waiting'
  const [bannerState, setBannerState] = useState('none')
  // Banner data for multi-order aggregate
  const [bannerOrders, setBannerOrders] = useState([])
  // Countdown
  const [countdownMs, setCountdownMs] = useState(null)
  const countdownRef = useRef(null)
  // Sound
  const beepRef = useRef(null)
  const vibTimerRef = useRef(null)
  const [soundOn, setSoundOn] = useState(() => getSetting(SOUND_KEY, true))
  const [soundStyle, setSoundStyle] = useState(() => getSetting(STYLE_KEY, 'bell'))
  const [vibrateOn, setVibrateOn] = useState(() => getSetting(VIB_KEY, true))
  const [packMins, setPackMins] = useState(() => parseInt(getSetting(PACK_KEY, '15'), 10))
  // Audio context unlocked by first user tap
  const [audioUnlocked, setAudioUnlocked] = useState(() => getSetting(AUDIO_UNLOCKED_KEY, false) === true)
  const [showAudioStrip, setShowAudioStrip] = useState(false)
  // Web Push sheet
  const [showPushSheet, setShowPushSheet] = useState(false)
  const [pushGranted, setPushGranted] = useState(false)
  const [pushDenied, setPushDenied] = useState(false)
  // Already-seen placed order IDs (for polling diff)
  const seenRef = useRef(new Set())
  // Practice mode flag (set by checklist component)
  const [practiceActive, setPracticeActive] = useState(false)
  const [practiceOrder, setPracticeOrder] = useState(null)
  // Coach step for practice
  const [coachStep, setCoachStep] = useState(0) // 0=none, 1=accept, 2=pack

  // ---- Exposed context value so BottomNav / checklist can use it --------
  const ctx = {
    queueLen: queue.length,
    bannerState,
    soundOn, setSoundOn: (v) => { setSoundOn(v); setSetting(SOUND_KEY, v) },
    soundStyle, setSoundStyle: (v) => { setSoundStyle(v); setSetting(STYLE_KEY, v) },
    vibrateOn, setVibrateOn: (v) => { setVibrateOn(v); setSetting(VIB_KEY, v) },
    packMins, setPackMins: (v) => { setPackMins(v); setSetting(PACK_KEY, v) },
    pushGranted, pushDenied,
    previewSound: (style) => { playBeep(style, 2000) },
    triggerTestAlert: () => { playBeep(soundStyle, 3000); if (vibrateOn) navigator.vibrate?.([300, 120, 300]) },
    requestPush: handleRequestPush,
    startPractice: startPracticeOrder,
    practiceActive,
    setPracticeActive,
  }

  // ---- Audio unlock -------------------------------------------------------
  useEffect(() => {
    if (!audioUnlocked) {
      // Show strip only after a few seconds (let the page settle)
      const t = setTimeout(() => setShowAudioStrip(true), 2500)
      return () => clearTimeout(t)
    }
  }, [audioUnlocked])

  function handleFirstTap() {
    if (!audioUnlocked) {
      try {
        const ctx2 = new (window.AudioContext || window.webkitAudioContext)()
        ctx2.resume()
      } catch (_) {}
      setAudioUnlocked(true)
      setSetting(AUDIO_UNLOCKED_KEY, true)
      setShowAudioStrip(false)
    }
  }

  // ---- Sound & vibration --------------------------------------------------
  function startRinging() {
    stopRinging()
    if (soundOn && audioUnlocked) {
      beepRef.current = playBeep(soundStyle, 30)
    }
    if (vibrateOn) {
      const pat = [300, 120, 300, 120, 600]
      navigator.vibrate?.(pat)
      vibTimerRef.current = setInterval(() => navigator.vibrate?.(pat), 1500)
    }
  }

  function stopRinging() {
    beepRef.current?.stop()
    beepRef.current = null
    clearInterval(vibTimerRef.current)
    vibTimerRef.current = null
    navigator.vibrate?.(0)
  }

  // ---- Countdown ----------------------------------------------------------
  function startCountdown(order) {
    clearInterval(countdownRef.current)
    const created = toDate(order?.createdAt || order?.created_at)
    const mins = order?.promisedMins ?? packMins
    if (!created) { setCountdownMs(null); return }
    const target = created.getTime() + mins * 60 * 1000

    function tick() {
      const diff = target - Date.now()
      setCountdownMs(diff)
    }
    tick()
    countdownRef.current = setInterval(tick, 1000)
  }

  function stopCountdown() {
    clearInterval(countdownRef.current)
    countdownRef.current = null
    setCountdownMs(null)
  }

  // ---- Build alert when queue changes ------------------------------------
  useEffect(() => {
    if (queue.length === 0) {
      stopRinging()
      stopCountdown()
      setBannerState('none')
      setBannerOrders([])
      setStage('alert')
      setQIdx(0)
      setDeclReason('')
      setOfflineStrip(false)
      return
    }
    const cur = queue[qIdx] || queue[0]
    startRinging()
    startCountdown(cur)
    setBannerState('new')
    setBannerOrders(queue)
  }, [queue, qIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Polling: detect new placed orders ---------------------------------
  useEffect(() => {
    let alive = true
    async function poll() {
      try {
        const res = await api.get('/orders')
        const list = Array.isArray(res.data) ? res.data : res.data?.orders || []
        const placed = list.filter((o) => o.status === 'placed' && !o.isPractice)
        const newOrders = placed.filter((o) => !seenRef.current.has(o.id))
        if (newOrders.length > 0 && alive) {
          newOrders.forEach((o) => seenRef.current.add(o.id))
          setQueue((prev) => {
            const existingIds = new Set(prev.map((x) => x.id))
            const toAdd = newOrders.filter((o) => !existingIds.has(o.id))
            return toAdd.length > 0 ? [...prev, ...toAdd] : prev
          })
        }
      } catch (_) {}
    }
    poll()
    const interval = setInterval(poll, 30000)
    return () => { alive = false; clearInterval(interval) }
  }, [])

  // ---- Offline queue flush on reconnect ----------------------------------
  useEffect(() => {
    async function flushQueue() {
      const q = readQueue()
      if (q.length === 0) return
      const remaining = []
      for (const action of q) {
        try {
          await api.patch(`/orders/${action.orderId}/status`, { status: action.status })
          if (action.status === 'accepted') toast('Order accepted.', 'success')
          else if (action.status === 'cancelled') toast('Order declined.', 'success')
          seenRef.current.delete(action.orderId)
        } catch (err) {
          if (err?.code === 'ERR_NETWORK') {
            remaining.push(action)
          } else {
            toast('This order is no longer available — it may have been cancelled.', 'error')
          }
        }
      }
      writeQueue(remaining)
    }
    window.addEventListener('online', flushQueue)
    return () => window.removeEventListener('online', flushQueue)
  }, [toast])

  // ---- Helpers ------------------------------------------------------------
  function advanceQueue() {
    setQueue((prev) => {
      const next = prev.slice(1)
      return next
    })
    setQIdx(0)
    setStage('alert')
    setDeclReason('')
    setOfflineStrip(false)
    setCoachStep(0)
  }

  function totalBannerAmount() {
    return bannerOrders.reduce((s, o) => {
      const items = Array.isArray(o.items) ? o.items : []
      return s + (o.total ?? items.reduce((sum, it) => sum + (Number(it.price) || 0) * (it.quantity ?? it.qty ?? 1), 0))
    }, 0)
  }

  // ---- Practice order creation -------------------------------------------
  async function startPracticeOrder() {
    if (practiceActive) return
    const demoOrder = {
      id: `practice-${Date.now()}`,
      isPractice: true,
      status: 'placed',
      customer_name: 'Practice Customer',
      fulfillment: 'pickup',
      total: 99,
      items: [
        { name: 'Demo Item 1', quantity: 1, price: 30 },
        { name: 'Demo Item 2', quantity: 2, price: 20 },
        { name: 'Demo Item 3', quantity: 1, price: 29 },
      ],
      created_at: new Date().toISOString(),
    }
    setPracticeOrder(demoOrder)
    setPracticeActive(true)
    setQueue((prev) => {
      // Real orders first, practice last
      const real = prev.filter((o) => !o.isPractice)
      return [...real, demoOrder]
    })
    setCoachStep(1)
  }

  // ---- Accept order -------------------------------------------------------
  async function handleAccept() {
    const cur = queue[qIdx]
    if (!cur) return
    stopRinging()

    // Practice flow
    if (cur.isPractice) {
      if (coachStep === 1) { setStage('packing'); setCoachStep(2); return }
      return
    }

    setAccepting(true)
    try {
      await api.patch(`/orders/${cur.id}/status`, { status: 'accepted' })
      toast('Order accepted. Pack the items.', 'success')
      seenRef.current.delete(cur.id)
      setStage('packing')
      setOfflineStrip(false)

      // Web Push: ask once after first accepted order
      const asked = getSetting(PUSH_ASKED_KEY, false)
      const snoozedUntil = getSetting(PUSH_SNOOZE_KEY, '')
      const now = new Date().toDateString()
      if (!asked && (!snoozedUntil || new Date(snoozedUntil) <= new Date())) {
        setShowPushSheet(true)
      }
    } catch (err) {
      if (err?.code === 'ERR_NETWORK' || !navigator.onLine) {
        setOfflineStrip(true)
        setAccepting(false)
        pushQueue({ orderId: cur.id, status: 'accepted' })
        setBannerState('waiting')
      } else {
        toast('This order is no longer available — it may have been cancelled.', 'error')
        advanceQueue()
      }
    } finally {
      setAccepting(false)
    }
  }

  // ---- Mark packed --------------------------------------------------------
  async function handlePacked() {
    const cur = queue[qIdx]
    if (!cur) return

    // Practice flow — show success screen
    if (cur.isPractice) {
      stopRinging()
      stopCountdown()
      setStage('practice-success')
      setCoachStep(0)
      navigator.vibrate?.(100)
      toast('Practice complete', 'success')
      try {
        localStorage.setItem('lf_practice_completed_at', new Date().toISOString())
      } catch (_) {}
      try {
        const shopRes = await api.get('/shops?mine=true')
        const shops = Array.isArray(shopRes.data) ? shopRes.data : shopRes.data?.shops || []
        const shop = shops[0]
        if (shop) {
          await api.put(`/shops/${shop.id}`, { practiceCompletedAt: new Date().toISOString() })
        }
      } catch (_) {}
      return
    }

    try {
      await api.patch(`/orders/${cur.id}/status`, { status: 'packed' })
      toast('Marked packed.', 'success')
      navigator.vibrate?.(100)
      advanceQueue()
    } catch (err) {
      toast('Could not update order — try again.', 'error')
    }
  }

  // ---- Decline ------------------------------------------------------------
  async function handleDecline() {
    const cur = queue[qIdx]
    if (!cur || !declReason) return
    setDeclining(true)
    try {
      await api.patch(`/orders/${cur.id}/status`, { status: 'cancelled' })
      toast('Order declined.', 'success')
      seenRef.current.delete(cur.id)
      advanceQueue()
    } catch (err) {
      if (err?.code === 'ERR_NETWORK' || !navigator.onLine) {
        pushQueue({ orderId: cur.id, status: 'cancelled' })
        advanceQueue()
      } else {
        toast('This order is no longer available — it may have been cancelled.', 'error')
        advanceQueue()
      }
    } finally {
      setDeclining(false)
    }
  }

  // ---- Pack later ---------------------------------------------------------
  function handlePackLater() {
    stopRinging()
    setQueue([])
    setBannerState('waiting')
  }

  // ---- End practice -------------------------------------------------------
  function handleEndPractice() {
    setPracticeActive(false)
    setPracticeOrder(null)
    setCoachStep(0)
    setQueue((prev) => prev.filter((o) => !o.isPractice))
  }

  // ---- Web Push -----------------------------------------------------------
  async function handleRequestPush() {
    setSetting(PUSH_ASKED_KEY, true)
    setShowPushSheet(false)
    try {
      const result = await Notification.requestPermission()
      if (result === 'granted') {
        setPushGranted(true)
        toast('Alerts on. New orders will ring even when the app is closed.', 'success')
      } else {
        setPushDenied(true)
      }
    } catch (_) {
      setPushDenied(true)
    }
  }

  function handlePushNotNow() {
    setSetting(PUSH_SNOOZE_KEY, new Date(Date.now() + 7 * 86400000).toDateString())
    setShowPushSheet(false)
  }

  // ---- Render helpers -----------------------------------------------------
  const cur = queue[qIdx] || null
  const items = Array.isArray(cur?.items) ? cur.items : []
  const orderTotal = cur
    ? (cur.total ?? items.reduce((s, it) => s + (Number(it.price) || 0) * (it.quantity ?? it.qty ?? 1), 0))
    : 0

  const countFmt = fmtCountdown(countdownMs)
  const isLate = countdownMs !== null && countdownMs < 0
  const lateMin = isLate ? Math.floor(Math.abs(countdownMs) / 60000) : 0

  const isPractice = cur?.isPractice === true

  // ---- Render -------------------------------------------------------------
  return (
    <AlertCtx.Provider value={ctx}>
      {/* Audio unlock tap listener */}
      <div style={{ display: 'contents' }} onClick={handleFirstTap}>
        {children}
      </div>

      {/* Audio unlock strip */}
      {showAudioStrip && !audioUnlocked && (
        <div className="audio-unlock-strip" style={{ position: 'fixed', bottom: 'calc(var(--tabbar-h) + 8px)', left: '50%', transform: 'translateX(-50%)', width: 'min(92vw, 560px)', zIndex: 'var(--z-toast)' }}>
          <Icon name="bell" size={16} />
          <span style={{ flex: 1 }}>Tap anywhere once to turn on order sounds — phones block sound until you tap.</span>
          <button type="button" onClick={(e) => { e.stopPropagation(); setShowAudioStrip(false) }} aria-label="Dismiss">
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      {/* Sticky banner (renders when queue non-empty or pack-later state) */}
      {(bannerState !== 'none') && (
        <div
          className={`new-order-banner ${bannerState === 'waiting' ? 'is-waiting' : ''}`}
          aria-live="assertive"
        >
          <span className="pulse-dot" />
          <span className="new-order-banner-text">
            {bannerState === 'waiting'
              ? 'Order waiting — accept or decline'
              : bannerOrders.length > 1
                ? `${bannerOrders.length} new orders · ₹${totalBannerAmount().toLocaleString('en-IN')} total`
                : `New order · ₹${orderTotal.toLocaleString('en-IN')} · ${cur?.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}`
            }
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: '4px', minWidth: '44px', minHeight: '44px' }}
            onClick={stopRinging}
            aria-label="Mute alert"
          >
            <Icon name="mute" size={18} />
          </button>
          {queue.length > 0 && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => { setStage('alert'); setQIdx(0) }}
            >
              View
            </button>
          )}
        </div>
      )}

      {/* Full-screen order alert */}
      {queue.length > 0 && stage !== 'none' && (
        <div className="order-alert-host" role="alertdialog" aria-modal="true" aria-label="New order">
          <div className="order-alert">
            {/* Practice strip */}
            {isPractice && (
              <div className="practice-strip">
                <span className="practice-pill">PRACTICE</span>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Practice order — no real customer</span>
              </div>
            )}

            {/* End practice button */}
            {isPractice && stage !== 'practice-success' && (
              <button className="alert-end-practice" type="button" onClick={() => {
                if (window.confirm('End practice? You can restart it anytime from the checklist.')) {
                  handleEndPractice()
                }
              }}>
                End practice
              </button>
            )}

            {/* ===== PRACTICE SUCCESS STATE ===== */}
            {stage === 'practice-success' && (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#256e1e', display: 'grid', placeItems: 'center', margin: '0 auto 16px', animation: 'lf-scale-in .2s ease' }}>
                  <Icon name="check" size={32} className="" style={{ color: '#fff', stroke: '#fff' }} />
                </div>
                <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800 }}>Practice complete</h2>
                <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 20px', lineHeight: 1.4 }}>
                  You accepted and packed an order. Real orders work exactly the same way.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button type="button" className="btn btn-primary btn-block" style={{ height: 52 }} onClick={() => { handleEndPractice(); advanceQueue() }}>
                    Go live now
                  </button>
                  <button type="button" className="btn btn-outline btn-block" onClick={() => { handleEndPractice(); advanceQueue() }}>
                    Back to setup
                  </button>
                </div>
              </div>
            )}

            {/* ===== ERROR STATE ===== */}
            {stage === 'error' && (
              <div>
                <p style={{ fontWeight: 700, fontSize: 16 }}>This order is no longer available — it may have been cancelled.</p>
                <button type="button" className="btn btn-outline btn-block" onClick={advanceQueue}>OK</button>
              </div>
            )}

            {/* ===== DECLINE STATE ===== */}
            {stage === 'decline' && (
              <>
                <div>
                  <p style={{ fontSize: 18, fontWeight: 800, margin: '0 0 6px' }}>Decline this order?</p>
                  <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>The customer will be told the shop could not take the order.</p>
                </div>
                <div className="reason-chips">
                  {DECLINE_REASONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`chip ${declReason === r ? 'active' : ''}`}
                      style={{ minHeight: 44 }}
                      onClick={() => setDeclReason(r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button
                    type="button"
                    className="btn btn-danger btn-block"
                    style={{ height: 52 }}
                    disabled={!declReason || declining}
                    onClick={handleDecline}
                  >
                    {declining ? 'Declining…' : 'Decline order'}
                  </button>
                  <button type="button" className="alert-tertiary" onClick={() => setStage('alert')}>
                    Keep this order
                  </button>
                </div>
              </>
            )}

            {/* ===== ALERT STATE ===== */}
            {stage === 'alert' && !['decline', 'error', 'practice-success'].includes(stage) && (
              <>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`pulse-dot ${stage === 'packing' ? 'is-green' : ''}`} />
                  <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: '#1a1a1a', flex: 1 }}>
                    New order
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>
                    #{String(cur?.id || '').slice(-6).toUpperCase()}
                  </span>
                </div>
                {queue.length > 1 && (
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#f57c00', margin: '-10px 0 -4px' }}>
                    Order {qIdx + 1} of {queue.length}
                  </p>
                )}

                {/* Order total */}
                <div>
                  <div className="order-alert-total-label">ORDER TOTAL</div>
                  <div className="order-alert-total">₹{orderTotal.toLocaleString('en-IN')}</div>
                </div>

                {/* Meta */}
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>
                    {cur?.customer_name || 'Customer'}
                    {' · '}
                    <span className={`badge ${cur?.fulfillment === 'delivery' ? 'badge-blue' : 'badge-purple'}`}>
                      {cur?.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
                    {items.length} items{cur?.address ? ` · ${cur.address}` : ''}
                  </div>
                </div>

                {/* Countdown pill */}
                <div>
                  <span className={`order-alert-timer ${isLate ? 'is-late' : ''}`}>
                    <Icon name="clock" size={14} />
                    {isLate
                      ? `${lateMin} min over — pack soon`
                      : countFmt
                        ? `Pack in ${countFmt}`
                        : 'Pack as soon as possible'
                    }
                  </span>
                </div>

                {/* Item list */}
                {items.length > 0 && (
                  <ul className="order-items" style={{ maxHeight: '30vh', overflowY: 'auto' }}>
                    {items.map((it, i) => (
                      <li key={i}>
                        <span>{it.name || it.product_name || 'Item'} &times; {it.quantity ?? it.qty ?? 1}</span>
                        {it.price != null && <span className="muted">₹{it.price}</span>}
                      </li>
                    ))}
                  </ul>
                )}

                {/* Offline strip */}
                {offlineStrip && (
                  <div className="offline-strip">
                    <span style={{ flex: 1 }}>No internet. We'll keep trying in the background.</span>
                    <button type="button" className="btn btn-sm btn-outline" style={{ fontSize: 12 }} onClick={handleAccept}>
                      Retry now
                    </button>
                  </div>
                )}

                {/* Action zone */}
                <div className={`order-alert-actions ${isPractice && coachStep === 1 ? 'coach-target' : ''}`}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ flex: 2 }}
                    disabled={accepting}
                    onClick={handleAccept}
                  >
                    {accepting ? 'Accepting…' : 'ACCEPT'}
                  </button>
                  {!isPractice && (
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ flex: 1 }}
                      onClick={() => { setStage('decline'); setDeclReason('') }}
                    >
                      DECLINE
                    </button>
                  )}
                </div>

                {/* Coach tooltip for practice step 1 */}
                {isPractice && coachStep === 1 && (
                  <>
                    <div className="coach-overlay" />
                    <div className="coach-tooltip" style={{ position: 'relative', zIndex: 'var(--z-coach-target)' }}>
                      <p>Real orders will look just like this. Tap ACCEPT to continue.</p>
                      <div className="coach-dots">
                        <span className="coach-dot active" />
                        <span className="coach-dot" />
                      </div>
                    </div>
                  </>
                )}

                {!isPractice && (
                  <button type="button" className="alert-tertiary" onClick={handlePackLater}>
                    I'll pack it later
                  </button>
                )}
              </>
            )}

            {/* ===== PACKING STATE (after ACCEPT) ===== */}
            {stage === 'packing' && !['decline', 'error', 'practice-success'].includes(stage) && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="pulse-dot is-green" />
                  <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase' }}>Accepted — pack the items</span>
                </div>

                {/* Keep the countdown */}
                <div>
                  <span className={`order-alert-timer ${isLate ? 'is-late' : ''}`}>
                    <Icon name="clock" size={14} />
                    {isLate
                      ? `${lateMin} min over — pack soon`
                      : countFmt ? `Pack in ${countFmt}` : 'Pack as soon as possible'
                    }
                  </span>
                </div>

                {items.length > 0 && (
                  <ul className="order-items" style={{ maxHeight: '30vh', overflowY: 'auto' }}>
                    {items.map((it, i) => (
                      <li key={i}>
                        <span>{it.name || it.product_name || 'Item'} &times; {it.quantity ?? it.qty ?? 1}</span>
                        {it.price != null && <span className="muted">₹{it.price}</span>}
                      </li>
                    ))}
                  </ul>
                )}

                <div className={`order-alert-actions ${isPractice && coachStep === 2 ? 'coach-target' : ''}`}>
                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    onClick={handlePacked}
                  >
                    MARK PACKED
                  </button>
                </div>

                {/* Coach tooltip for practice step 2 */}
                {isPractice && coachStep === 2 && (
                  <>
                    <div className="coach-overlay" />
                    <div className="coach-tooltip" style={{ position: 'relative', zIndex: 'var(--z-coach-target)' }}>
                      <p>Good. Now imagine the bag is packed. Tap MARK PACKED.</p>
                      <div className="coach-dots">
                        <span className="coach-dot" />
                        <span className="coach-dot active" />
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Web Push pre-permission sheet */}
      {showPushSheet && (
        <>
          <div className="sheet-scrim" onClick={handlePushNotNow} />
          <div className="sheet" role="dialog" aria-modal="true">
            <div className="sheet-handle" />
            <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fff8e1', display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}>
                <Icon name="bell" size={28} style={{ color: '#f8cb46' }} />
              </div>
              <p className="sheet-title">Get alerts when the app is closed</p>
              <p style={{ fontSize: 14, color: 'var(--muted)', margin: '8px 0 20px', lineHeight: 1.4 }}>
                New orders will ring on this phone even when the app is in the background. Your browser will ask for permission next.
              </p>
              <button type="button" className="btn btn-primary btn-block" style={{ height: 52 }} onClick={handleRequestPush}>
                Turn on alerts
              </button>
              <button type="button" className="alert-tertiary" style={{ marginTop: 12 }} onClick={handlePushNotNow}>
                Not now
              </button>
            </div>
          </div>
        </>
      )}
    </AlertCtx.Provider>
  )
}
