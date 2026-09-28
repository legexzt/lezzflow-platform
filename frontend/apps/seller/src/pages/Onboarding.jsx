/**
 * Onboarding wizard (/onboarding) — ITEM 1 seller app.
 * 4 steps with progress indicator:
 *   1. Shop profile     → funnel event 'profile'
 *   2. First products   → funnel event 'products' (first product only)
 *   3. Test order       → funnel event 'test_order' (poll /orders, manual confirm fallback)
 *   4. Go live          → POST /v1/shops/:id/go-live, funnel event 'go_live'
 *
 * Progress is persisted to localStorage ('lf_onboarding') so a refresh resumes.
 * If the shop is already live (shop.is_live === true), redirect to '/'.
 * Zero emoji — SVG icons only (Icon.jsx).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext.jsx'
import { useToast } from '../components/Toast.jsx'
import Loading from '../components/Loading.jsx'
import Icon from '../components/Icon.jsx'
import BarcodeScanner from '../components/BarcodeScanner.jsx'
import {
  fetchMyShop,
  saveShopProfile,
  trackFunnelEvent,
  getProductCount,
  createProduct,
  deleteProduct,
  checkTestOrderDetected,
  goLiveShop,
} from '../api/onboarding.js'
import { getErrorMessage } from '../api.js'

const STORAGE_KEY = 'lf_onboarding'
const PRODUCT_TARGET = 10
const CATEGORIES = [
  'Kirana / Grocery',
  'Dairy',
  'Bakery',
  'Fruits & Vegetables',
  'Medicines',
  'Stationery',
  'Other',
]

const STEPS = [
  { key: 'profile', label: 'Your shop', icon: 'home' },
  { key: 'products', label: 'Add products', icon: 'box' },
  { key: 'test_order', label: 'Test order', icon: 'bag' },
  { key: 'go_live', label: 'Go live', icon: 'megaphone' },
]

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveProgress(p) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
  } catch { /* noop */ }
}

function clearProgress() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch { /* noop */ }
}

function BetaBadge() {
  return <span className="ob-beta-badge">₹0 commission during beta</span>
}

function StepHeader({ step }) {
  return (
    <div className="ob-progress">
      <div className="ob-progress-bar">
        <div className="ob-progress-fill" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>
      <div className="ob-progress-steps">
        {STEPS.map((s, i) => (
          <div key={s.key} className={`ob-progress-step ${i < step ? 'is-done' : ''} ${i === step ? 'is-current' : ''}`}>
            <span className="ob-progress-dot">
              {i < step ? <Icon name="check" size={12} /> : <Icon name={s.icon} size={14} />}
            </span>
            <span className="ob-progress-label">{s.label}</span>
          </div>
        ))}
      </div>
      <div className="ob-progress-meta">Step {step + 1} of {STEPS.length}</div>
    </div>
  )
}

// ---- Step 1: Shop profile -------------------------------------------------
function StepProfile({ shop, onSaved }) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [locating, setLocating] = useState(false)
  const [form, setForm] = useState({
    name: '',
    address: '',
    lat: '',
    lng: '',
    open_time: '',
    close_time: '',
    category: CATEGORIES[0],
  })

  useEffect(() => {
    if (shop) {
      setForm({
        name: shop.name || '',
        address: shop.address || '',
        lat: shop.lat ?? '',
        lng: shop.lng ?? '',
        open_time: shop.open_time || shop.openTime || '',
        close_time: shop.close_time || shop.closeTime || '',
        category: shop.category || CATEGORIES[0],
      })
    }
  }, [shop])

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      toast('Geolocation is not supported on this device — enter coordinates manually.', 'error')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        update('lat', pos.coords.latitude.toFixed(6))
        update('lng', pos.coords.longitude.toFixed(6))
        setLocating(false)
        toast('Location captured', 'success')
      },
      (err) => {
        setLocating(false)
        toast(err?.code === 1
          ? 'Location permission denied. Allow location access or enter coordinates manually.'
          : err?.message || 'Could not get your location', 'error')
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return toast('Please enter a shop name', 'error')
    if (!form.address.trim()) return toast('Please enter a shop address', 'error')
    const lat = Number(form.lat)
    const lng = Number(form.lng)
    if (form.lat === '' || form.lng === '' || Number.isNaN(lat) || Number.isNaN(lng)) {
      return toast('Please set your shop location', 'error')
    }
    setSaving(true)
    try {
      const saved = await saveShopProfile(shop?.id || null, {
        name: form.name.trim(),
        address: form.address.trim(),
        lat,
        lng,
        open_time: form.open_time || null,
        close_time: form.close_time || null,
        category: form.category,
      })
      await trackFunnelEvent('profile')
      toast('Shop profile saved', 'success')
      onSaved(saved)
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2 className="ob-title">Your shop</h2>
      <p className="ob-sub">Tell customers who you are and where to find you.</p>
      <BetaBadge />

      <div className="field">
        <label htmlFor="ob-name">Shop name</label>
        <input id="ob-name" type="text" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="e.g. Sharma Kirana Store" />
      </div>

      <div className="field">
        <label htmlFor="ob-category">Category</label>
        <select id="ob-category" value={form.category} onChange={(e) => update('category', e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="field">
        <label htmlFor="ob-address">Address</label>
        <textarea id="ob-address" rows="2" value={form.address} onChange={(e) => update('address', e.target.value)} placeholder="Shop no, street, area, city" />
      </div>

      <div className="field">
        <label>GPS location</label>
        <button type="button" className="btn btn-outline btn-block" onClick={useMyLocation} disabled={locating}>
          {locating ? 'Detecting location…' : (<><Icon name="location" size={16} /> Use my current location</>)}
        </button>
        <div className="field-row">
          <input type="number" step="any" inputMode="decimal" value={form.lat} onChange={(e) => update('lat', e.target.value)} placeholder="Latitude" aria-label="Latitude" />
          <input type="number" step="any" inputMode="decimal" value={form.lng} onChange={(e) => update('lng', e.target.value)} placeholder="Longitude" aria-label="Longitude" />
        </div>
      </div>

      <div className="field">
        <label>Opening hours</label>
        <div className="field-row">
          <input type="time" value={form.open_time} onChange={(e) => update('open_time', e.target.value)} aria-label="Opening time" />
          <input type="time" value={form.close_time} onChange={(e) => update('close_time', e.target.value)} aria-label="Closing time" />
        </div>
        <p className="hint">So customers know when you are open.</p>
      </div>

      <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
        {saving ? 'Saving…' : 'Save & continue'}
      </button>
    </form>
  )
}

// ---- Step 2: Products -----------------------------------------------------
function StepProducts({ shop, initialCount, onContinue }) {
  const toast = useToast()
  const [count, setCount] = useState(initialCount)
  const [pendingBarcode, setPendingBarcode] = useState(null)
  const [quickForm, setQuickForm] = useState({ name: '', price: '', stock: 1 })
  const [saving, setSaving] = useState(false)
  const [sessionProducts, setSessionProducts] = useState([]) // {id, name, price, barcode}
  const [removing, setRemoving] = useState(null)
  const funnelSentRef = useRef(false)

  function handleDetected(barcode) {
    setPendingBarcode(barcode)
    setQuickForm({ name: '', price: '', stock: 1 })
  }

  async function handleQuickAdd(e) {
    e.preventDefault()
    if (!quickForm.name.trim()) return toast('Enter the product name', 'error')
    const price = Number(quickForm.price)
    if (quickForm.price === '' || Number.isNaN(price) || price < 0) {
      return toast('Enter a valid price', 'error')
    }
    setSaving(true)
    try {
      const payload = {
        name: quickForm.name.trim(),
        price,
        stock: Math.max(0, Number(quickForm.stock) || 0),
        barcode: pendingBarcode || null,
        shop_id: shop.id,
      }
      const saved = await createProduct(payload)
      const id = saved?.id || saved?.product?.id
      setCount((c) => c + 1)
      setSessionProducts((list) => [{ id, name: payload.name, price: payload.price, barcode: payload.barcode }, ...list])
      if (!funnelSentRef.current) {
        funnelSentRef.current = true
        await trackFunnelEvent('products')
      }
      toast('Product added', 'success')
      setPendingBarcode(null)
      setQuickForm({ name: '', price: '', stock: 1 })
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(p) {
    if (!p.id || removing) return
    setRemoving(p.id)
    try {
      await deleteProduct(p.id)
      setSessionProducts((list) => list.filter((x) => x.id !== p.id))
      setCount((c) => Math.max(0, c - 1))
    } catch (err) {
      toast(getErrorMessage(err, 'Could not remove product'), 'error')
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div>
      <h2 className="ob-title">Add your first products</h2>
      <p className="ob-sub">Scan barcodes to add products fast. Aim for 10 — you can add more anytime.</p>
      <BetaBadge />

      <div className="ob-counter">
        <span className="ob-counter-num">{count} / {PRODUCT_TARGET}</span>
        <span className="muted">products added</span>
      </div>
      <div className="ob-progress-bar ob-counter-bar">
        <div className="ob-progress-fill" style={{ width: `${Math.min(100, (count / PRODUCT_TARGET) * 100)}%` }} />
      </div>

      {!pendingBarcode ? (
        <BarcodeScanner onDetected={handleDetected} active />
      ) : (
        <div className="card ob-quick-add">
          <div className="ob-quick-add-head">
            <div>
              <div className="ob-quick-add-title">New product</div>
              <div className="muted" style={{ fontSize: 12 }}>Barcode: {pendingBarcode}</div>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPendingBarcode(null)}>
              <Icon name="close" size={16} />
            </button>
          </div>
          <form onSubmit={handleQuickAdd}>
            <div className="field">
              <label htmlFor="ob-pname">Product name</label>
              <input id="ob-pname" type="text" value={quickForm.name} onChange={(e) => setQuickForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Amul Taaza Milk 1L" autoFocus />
            </div>
            <div className="field-row">
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="ob-pprice">Price (₹)</label>
                <input id="ob-pprice" type="number" inputMode="decimal" min="0" step="0.01" value={quickForm.price} onChange={(e) => setQuickForm((f) => ({ ...f, price: e.target.value }))} placeholder="₹" />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="ob-pstock">Stock</label>
                <input id="ob-pstock" type="number" inputMode="numeric" min="0" value={quickForm.stock} onChange={(e) => setQuickForm((f) => ({ ...f, stock: e.target.value }))} />
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={saving} style={{ marginTop: 12 }}>
              {saving ? 'Adding…' : 'Add product'}
            </button>
          </form>
        </div>
      )}

      {sessionProducts.length > 0 && (
        <div className="ob-session-list">
          <div className="ob-session-title">Added in this session</div>
          {sessionProducts.map((p) => (
            <div key={p.id || p.barcode} className="ob-session-row">
              <div className="ob-session-main">
                <div className="ob-session-name">{p.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>₹{p.price}{p.barcode ? ` · ${p.barcode}` : ''}</div>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleRemove(p)} disabled={removing === p.id} aria-label={`Remove ${p.name}`}>
                <Icon name="close" size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Link to="/products/new" className="ob-link">
        <Icon name="edit" size={14} /> Add products with full details
      </Link>

      <button type="button" className="btn btn-primary btn-block" onClick={onContinue} style={{ marginTop: 16 }}>
        Continue
      </button>
    </div>
  )
}

// ---- Step 3: Test order ---------------------------------------------------
function StepTestOrder({ shop, onDone }) {
  const toast = useToast()
  const [detected, setDetected] = useState(false)
  const [manualConfirmed, setManualConfirmed] = useState(false)
  const [checking, setChecking] = useState(false)

  const pollOnce = useCallback(async () => {
    if (!shop?.id) return false
    try {
      return await checkTestOrderDetected(shop.id)
    } catch (_) {
      return false
    }
  }, [shop])

  useEffect(() => {
    let cancelled = false
    let timer = null
    async function tick() {
      const found = await pollOnce()
      if (cancelled) return
      if (found) {
        setDetected(true)
        toast('Test order received — well done!', 'success')
        return
      }
      timer = setTimeout(tick, 6000)
    }
    tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [pollOnce, toast])

  async function handleCheckNow() {
    setChecking(true)
    const found = await pollOnce()
    setChecking(false)
    if (found) {
      setDetected(true)
      toast('Test order received — well done!', 'success')
    } else {
      toast('No test order found yet. Try placing one from the Mart app.', 'info')
    }
  }

  function handleManualConfirm() {
    setManualConfirmed(true)
    toast('Test order marked as done', 'success')
  }

  const done = detected || manualConfirmed

  return (
    <div>
      <h2 className="ob-title">Try a test order</h2>
      <p className="ob-sub">Make sure orders reach you correctly before you go live.</p>
      <BetaBadge />

      <div className="card ob-guide">
        <div className="ob-guide-step">
          <span className="ob-guide-num">1</span>
          <span>Open the <b>Mart app</b> on your phone.</span>
        </div>
        <div className="ob-guide-step">
          <span className="ob-guide-num">2</span>
          <span>Find <b>{shop?.name || 'your shop'}</b> and add something to the cart.</span>
        </div>
        <div className="ob-guide-step">
          <span className="ob-guide-num">3</span>
          <span>Place the order. It will ring on this phone.</span>
        </div>
      </div>

      <div className={`ob-status ${detected ? 'is-ok' : ''}`}>
        {detected ? (
          <><Icon name="check" size={18} /> Test order received — you are ready!</>
        ) : (
          <><span className="ob-pulse" /> Waiting for your test order…
          </>
        )}
      </div>

      {!detected && (
        <button type="button" className="btn btn-outline btn-block" onClick={handleCheckNow} disabled={checking}>
          {checking ? 'Checking…' : 'Check now'}
        </button>
      )}

      {!detected && !manualConfirmed && (
        <button type="button" className="btn btn-ghost btn-block" onClick={handleManualConfirm} style={{ marginTop: 8 }}>
          I did the test order
        </button>
      )}
      {manualConfirmed && !detected && (
        <p className="hint" style={{ textAlign: 'center' }}>Marked as done manually.</p>
      )}

      <button type="button" className="btn btn-primary btn-block" onClick={onDone} disabled={!done} style={{ marginTop: 16 }}>
        Continue
      </button>
      {!done && <p className="hint" style={{ textAlign: 'center' }}>Place a test order (or confirm manually) to continue.</p>}
    </div>
  )
}

// ---- Step 4: Go live ------------------------------------------------------
function StepGoLive({ shop, productCount, onLive }) {
  const toast = useToast()
  const [goingLive, setGoingLive] = useState(false)
  const [error, setError] = useState('')
  const [celebrating, setCelebrating] = useState(false)

  const profileDone = Boolean(shop?.name && shop?.lat != null && shop?.lng != null)
  const productsDone = productCount >= 1
  const canGoLive = profileDone && productsDone

  async function handleGoLive() {
    if (!shop?.id || goingLive) return
    setGoingLive(true)
    setError('')
    try {
      await goLiveShop(shop.id)
      await trackFunnelEvent('go_live')
      clearProgress()
      setCelebrating(true)
      onLive()
    } catch (err) {
      const reason = err?.response?.data?.error || err?.response?.data?.message
      setError(reason || getErrorMessage(err, 'Could not go live — try again.'))
    } finally {
      setGoingLive(false)
    }
  }

  if (celebrating) {
    return (
      <div className="ob-celebrate">
        <div className="ob-celebrate-ring">
          <Icon name="check" size={48} />
        </div>
        <h2 className="ob-title" style={{ textAlign: 'center' }}>You are live!</h2>
        <p className="ob-sub" style={{ textAlign: 'center' }}>
          Customers near you can now find {shop?.name || 'your shop'} and place orders.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center' }}><BetaBadge /></div>
        <Link to="/" className="btn btn-primary btn-block" style={{ marginTop: 20 }}>
          Go to dashboard
        </Link>
      </div>
    )
  }

  return (
    <div>
      <h2 className="ob-title">Go live</h2>
      <p className="ob-sub">One last check — then customers near you can order.</p>
      <BetaBadge />

      <div className="card ob-checklist">
        <div className={`ob-check-row ${profileDone ? 'is-done' : ''}`}>
          <span className="ob-check-box">{profileDone ? <Icon name="check" size={14} /> : null}</span>
          <span>Shop profile complete</span>
        </div>
        <div className={`ob-check-row ${productsDone ? 'is-done' : ''}`}>
          <span className="ob-check-box">{productsDone ? <Icon name="check" size={14} /> : null}</span>
          <span>At least 1 product added ({productCount})</span>
        </div>
      </div>

      {error && (
        <div className="ob-error">
          <Icon name="warning" size={16} />
          <span>{error}</span>
        </div>
      )}

      <button
        type="button"
        className="btn btn-primary btn-block"
        onClick={handleGoLive}
        disabled={!canGoLive || goingLive}
        style={{ marginTop: 16 }}
      >
        {goingLive ? 'Going live…' : 'Go live'}
      </button>
      {!canGoLive && (
        <p className="hint" style={{ textAlign: 'center' }}>
          {!profileDone ? 'Finish your shop profile first.' : 'Add at least 1 product first.'}
        </p>
      )}
      <p className="hint" style={{ textAlign: 'center' }}>
        Going live means customers near you can see your shop and place orders. You can turn this off anytime from More → Shop.
      </p>
    </div>
  )
}

// ---- Wizard shell ---------------------------------------------------------
export default function Onboarding() {
  const { loading: authLoading } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [booting, setBooting] = useState(true)
  const [shop, setShop] = useState(null)
  const [step, setStep] = useState(0)
  const [productCount, setProductCount] = useState(0)
  const [profileDone, setProfileDone] = useState(false)

  useEffect(() => {
    if (authLoading) return
    let cancelled = false
    ;(async () => {
      try {
        const s = await fetchMyShop()
        if (cancelled) return
        if (s?.is_live === true) {
          navigate('/', { replace: true })
          return
        }
        setShop(s)
        const saved = loadProgress()
        if (saved.shopId && s && saved.shopId !== s.id) {
          clearProgress() // different shop — restart the wizard
        } else {
          if (typeof saved.step === 'number' && saved.step >= 0 && saved.step < STEPS.length) {
            setStep(saved.step)
          }
          setProfileDone(Boolean(saved.profileDone))
        }
        if (s) {
          try {
            setProductCount(await getProductCount(s.id))
          } catch (_) { /* non-blocking */ }
        }
      } catch (err) {
        if (!cancelled) toast(getErrorMessage(err), 'error')
      } finally {
        if (!cancelled) setBooting(false)
      }
    })()
    return () => { cancelled = true }
  }, [authLoading, navigate, toast])

  // Persist progress on every step change
  useEffect(() => {
    if (booting) return
    saveProgress({ shopId: shop?.id || null, step, profileDone })
  }, [step, profileDone, shop, booting])

  function goTo(next) {
    const clamped = Math.max(0, Math.min(STEPS.length - 1, next))
    setStep(clamped)
    window.scrollTo(0, 0)
  }

  function handleProfileSaved(savedShop) {
    setShop(savedShop || shop)
    setProfileDone(true)
    goTo(1)
  }

  if (booting) return <Loading />

  return (
    <div className="page ob-page">
      <div className="ob-topbar">
        {step > 0 ? (
          <button type="button" className="btn btn-ghost btn-sm ob-back" onClick={() => goTo(step - 1)}>
            Back
          </button>
        ) : (
          <Link to="/" className="btn btn-ghost btn-sm ob-back">Skip for now</Link>
        )}
      </div>

      <StepHeader step={step} />

      <div className="card ob-card">
        {step === 0 && (
          <StepProfile shop={shop} onSaved={handleProfileSaved} />
        )}
        {step === 1 && shop && (
          <StepProducts
            shop={shop}
            initialCount={productCount}
            onContinue={() => goTo(2)}
          />
        )}
        {step === 1 && !shop && (
          <div>
            <p className="muted">Save your shop profile first.</p>
            <button type="button" className="btn btn-outline btn-block" onClick={() => goTo(0)}>
              Go to shop profile
            </button>
          </div>
        )}
        {step === 2 && shop && (
          <StepTestOrder shop={shop} onDone={async () => { await trackFunnelEvent('test_order'); goTo(3) }} />
        )}
        {step === 2 && !shop && (
          <div>
            <p className="muted">Save your shop profile first.</p>
            <button type="button" className="btn btn-outline btn-block" onClick={() => goTo(0)}>
              Go to shop profile
            </button>
          </div>
        )}
        {step === 3 && (
          <StepGoLive
            shop={shop}
            productCount={productCount}
            onLive={() => setShop((s) => (s ? { ...s, is_live: true } : s))}
          />
        )}
      </div>
    </div>
  )
}
