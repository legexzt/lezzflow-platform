import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import api, { getErrorMessage } from '../api.js'
import { useToast } from '../components/Toast.jsx'
import { useLang } from '../LanguageContext.jsx'
import Loading from '../components/Loading.jsx'
import Icon from '../components/Icon.jsx'

const TABS = [
  { key: 'ai', label: 'AI Scan', icon: 'camera' },
  { key: 'barcode', label: 'Barcode', icon: 'scan' },
  { key: 'manual', label: 'Manual', icon: 'edit' },
]

// ---- WebAudio beep for batch scan ----------------------------------------
function playBatchBeep(freq = 1046, durationMs = 120, gain = 0.15) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.connect(g)
    g.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = freq
    g.gain.setValueAtTime(gain, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + durationMs / 1000)
  } catch (_) {}
}

// ---- Review sheet for batch -----------------------------------------------
function ReviewSheet({ rows, onUpdateRow, onFinish, onClose }) {
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="sheet-handle" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <p className="sheet-title">Review batch ({rows.length})</p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <p className="hint" style={{ marginBottom: 12 }}>Fix prices below — items at ₹0 need a price.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {rows.map((row, i) => (
            <div key={row.barcode} className="batch-row">
              {/* Thumb */}
              {row.image_url ? (
                <img src={row.image_url} alt={row.name} style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 48, height: 48, borderRadius: 8, background: '#f5f5f5', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 11, color: 'var(--muted)' }}>
                  {(row.name || '?').charAt(0).toUpperCase()}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.name || `Barcode ${row.barcode}`}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  {/* Status chip */}
                  {row.status === 'needs-price' && (
                    <span className="batch-row__chip--warn">Needs price</span>
                  )}
                  {row.status === 'not-found' && (
                    <span className="batch-row__chip--miss">Not found — fill later</span>
                  )}
                  {row.status === 'save-failed' && (
                    <span
                      className="batch-row__chip--miss"
                      style={{ cursor: 'pointer', textDecoration: 'underline' }}
                      onClick={() => onUpdateRow(i, { ...row, _retry: true })}
                    >
                      Save failed — tap to retry
                    </span>
                  )}
                  {row.status === 'not-found' && (
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>Barcode {row.barcode}</span>
                  )}
                </div>
                {/* Stepper */}
                {row.status !== 'not-found' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Stock:</span>
                    <div className="stepper">
                      <button type="button" onClick={() => onUpdateRow(i, { ...row, stock: Math.max(0, (row.stock || 0) - 1) })}>-</button>
                      <b>{row.stock ?? 0}</b>
                      <button type="button" onClick={() => onUpdateRow(i, { ...row, stock: (row.stock || 0) + 1 })}>+</button>
                    </div>
                  </div>
                )}
              </div>
              {/* Inline price input */}
              {row.status !== 'not-found' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>Price</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    className="price-inline"
                    min="0"
                    step="0.01"
                    value={row.price ?? ''}
                    onChange={(e) => onUpdateRow(i, { ...row, price: e.target.value })}
                    onBlur={() => {/* auto-save on blur handled by parent */}}
                    placeholder="₹"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-primary btn-block" onClick={onFinish}>
          Done
        </button>
      </div>
    </>
  )
}

export default function ProductForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const toast = useToast()
  const { t } = useLang()

  const [tab, setTab] = useState('ai')
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [shopId, setShopId] = useState(null)
  const [form, setForm] = useState({
    name: '',
    category: '',
    description: '',
    price: '',
    stock: '',
    cost_price: '',
    image_url: '',
  })

  // Post-lookup review strip state
  const [reviewStrip, setReviewStrip] = useState(null) // null | { name, image_url, mrp }
  const priceRef = useRef(null)
  const priceAnchorRef = useRef(null)
  const focusTimerRef = useRef(null)
  const [priceFieldFlash, setPriceFieldFlash] = useState(false)

  // Session counter (persists across tabs, resets on unmount)
  const [sessionCount, setSessionCount] = useState(0)
  const addedMapRef = useRef({}) // barcode -> productId
  const lastUsedPriceRef = useRef(null)

  // AI scan state
  const [scanning, setScanning] = useState(false)
  const [scanPreview, setScanPreview] = useState(null)
  const scanInputRef = useRef(null)

  // Barcode state
  const [code, setCode] = useState('')
  const [lookingUp, setLookingUp] = useState(false)

  // Camera barcode scanner state
  const [camScanning, setCamScanning] = useState(false)
  const [camDenied, setCamDenied] = useState(false)
  const camScannerRef = useRef(null)
  const camRegionId = 'barcode-cam-region'

  // Batch scan mode
  const [batchMode, setBatchMode] = useState(false)
  const [batchRows, setBatchRows] = useState([]) // queued rows for review
  const batchCooldownRef = useRef({}) // barcode -> last-decoded timestamp
  const [showReviewSheet, setShowReviewSheet] = useState(false)

  // Visual keyboard open state (hide bottom nav when keyboard visible)
  const [kbOpen, setKbOpen] = useState(false)

  // Stop camera if the component unmounts mid-scan
  useEffect(() => {
    return () => {
      const s = camScannerRef.current
      camScannerRef.current = null
      if (s) {
        s.stop().catch(() => {})
        try { s.clear() } catch { /* noop */ }
      }
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current)
    }
  }, [])

  // Visual viewport listener to detect keyboard open
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    function handleResize() {
      const ratio = vv.height / window.innerHeight
      setKbOpen(ratio < 0.75)
    }
    vv.addEventListener('resize', handleResize)
    return () => vv.removeEventListener('resize', handleResize)
  }, [])

  // Image upload state
  const [uploading, setUploading] = useState(false)
  const imageInputRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const shopRes = await api.get('/shops?mine=true')
        const shops = Array.isArray(shopRes.data) ? shopRes.data : shopRes.data?.shops || []
        const myShopId = shops[0]?.id || null
        if (myShopId && !cancelled) setShopId(myShopId)

        if (isEdit) {
          const res = await api.get('/products', { params: { shop_id: myShopId } })
          const products = Array.isArray(res.data) ? res.data : res.data?.products || []
          const p = products.find((x) => String(x.id) === String(id))
          if (cancelled) return
          if (p) {
            setForm({
              name: p.name || '',
              category: p.category || '',
              description: p.description || '',
              price: p.price ?? '',
              stock: p.stock ?? '',
              cost_price: p.cost_price ?? '',
              image_url: p.image_url || p.image || '',
            })
          } else {
            toast('Product not found', 'error')
            navigate('/products')
          }
        }
      } catch (err) {
        if (!cancelled) toast(getErrorMessage(err), 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, isEdit, navigate, toast])

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  // ---- Post-lookup focus flow (§4.1) --------------------------------------
  function triggerPostLookupFocus(mrp) {
    // Cancel any pending focus timer on pointer down inside the form
    // The cancel is set in a pointerdown handler below.
    // t=+300ms: scroll price into view
    // t=+450ms: focus price, flash ring
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current)

    focusTimerRef.current = setTimeout(() => {
      priceAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })

      focusTimerRef.current = setTimeout(() => {
        priceRef.current?.focus({ preventScroll: true })
        // 2s flash ring
        setPriceFieldFlash(false)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setPriceFieldFlash(true))
        })
        // Remove flash class on animationend
      }, 450)
    }, 300)
  }

  function cancelPendingFocus() {
    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current)
      focusTimerRef.current = null
    }
  }

  // ---- Barcode lookup handler (used by both manual and camera) ------------
  async function lookupBarcode(codeValue) {
    const c = (codeValue ?? code).trim()
    if (!c) {
      toast('Enter a barcode number first', 'error')
      return null
    }
    setLookingUp(true)
    try {
      const res = await api.post('/scan/barcode', { code: c })
      const d = res.data || {}
      if (d.found === false) {
        // §4.7 miss path (single mode): toast + focus product name
        toast('Barcode not found — fill in the details manually.', 'info')
        setTimeout(() => {
          document.getElementById('p-name')?.focus()
        }, 100)
        return null
      }
      const mrp = d.mrp != null ? Number(d.mrp) : null
      setForm((f) => ({
        ...f,
        name: d.name || f.name,
        description: d.brands ? `Brand: ${d.brands}` : f.description,
        image_url: d.image || f.image_url,
        price: mrp != null ? String(mrp) : f.price,
      }))
      const strip = { name: d.name || c, image_url: d.image || null, mrp }
      setReviewStrip(strip)
      toast('Details filled from barcode — review below', 'success')
      triggerPostLookupFocus(mrp)
      return { ...d, mrp }
    } catch (err) {
      if (err?.code === 'ERR_NETWORK') {
        toast('No connection — check network and try Lookup again.', 'error')
      } else {
        toast(getErrorMessage(err, 'Barcode lookup failed'), 'error')
      }
      return null
    } finally {
      setLookingUp(false)
    }
  }

  function handleBarcodeLookup(e) {
    e.preventDefault()
    lookupBarcode(code)
  }

  // ---- Camera scan --------------------------------------------------------
  async function stopCameraScan() {
    const s = camScannerRef.current
    camScannerRef.current = null
    setCamScanning(false)
    if (s) {
      try { await s.stop() } catch { /* noop */ }
      try { s.clear() } catch { /* noop */ }
    }
  }

  async function startCameraScan() {
    if (camScanning) return
    setCamScanning(true)
    await new Promise((r) => setTimeout(r, 60))
    try {
      const scanner = new Html5Qrcode(camRegionId)
      camScannerRef.current = scanner

      const onDecode = async (decodedText) => {
        if (batchMode) {
          // Batch: 2.5s cooldown per barcode
          const now = Date.now()
          const last = batchCooldownRef.current[decodedText] || 0
          if (now - last < 2500) return
          batchCooldownRef.current[decodedText] = now

          // Duplicate in session? PATCH stock+1
          if (addedMapRef.current[decodedText]) {
            const existingId = addedMapRef.current[decodedText]
            playBatchBeep(1046)
            navigator.vibrate?.(30)
            try {
              const prodRes = await api.get(`/products/${existingId}`)
              const existing = prodRes.data
              const newStock = (Number(existing.stock) || 0) + 1
              await api.put(`/products/${existingId}`, { stock: newStock })
              toast(`Already added — stock now ${newStock}`, 'success')
            } catch (_) {
              toast('Already added — could not update stock', 'error')
            }
            return
          }

          // Lookup
          setLookingUp(true)
          try {
            const res = await api.post('/scan/barcode', { code: decodedText })
            const d = res.data || {}
            if (d.found === false) {
              // Miss: low beep, queue to review — no row created
              playBatchBeep(392, 180, 0.1)
              toast(`Not found: ${decodedText} — queued to review`, 'info')
              setBatchRows((prev) => [
                ...prev,
                { barcode: decodedText, name: '', status: 'not-found', stock: 0, price: 0 },
              ])
              return
            }
            const mrp = d.mrp != null ? Number(d.mrp) : null
            const price = mrp ?? lastUsedPriceRef.current ?? 0
            const needsPrice = price === 0
            const payload = {
              name: d.name || decodedText,
              description: d.brands ? `Brand: ${d.brands}` : '',
              image_url: d.image || null,
              price,
              stock: 1,
              barcode: decodedText,
              ...(shopId ? { shop_id: shopId } : {}),
            }
            playBatchBeep(1046)
            navigator.vibrate?.(30)
            toast(`Saved: ${payload.name}`, 'success')
            // Save
            let savedId = null
            try {
              const saveRes = await api.post('/products', payload)
              savedId = saveRes.data?.id || saveRes.data?.product?.id
            } catch (_) {
              // retry once
              try {
                const saveRes2 = await api.post('/products', payload)
                savedId = saveRes2.data?.id || saveRes2.data?.product?.id
              } catch (_2) {
                setBatchRows((prev) => [
                  ...prev,
                  { barcode: decodedText, name: payload.name, image_url: payload.image_url, status: 'save-failed', stock: 1, price },
                ])
                return
              }
            }
            if (savedId) addedMapRef.current[decodedText] = savedId
            lastUsedPriceRef.current = price
            setSessionCount((n) => n + 1)
            if (needsPrice) {
              setBatchRows((prev) => [
                ...prev,
                { barcode: decodedText, name: payload.name, image_url: payload.image_url, status: 'needs-price', stock: 1, price: 0, productId: savedId },
              ])
            }
          } catch (_) {
            playBatchBeep(392, 180, 0.1)
          } finally {
            setLookingUp(false)
          }
        } else {
          // Single mode
          await stopCameraScan()
          setCode(decodedText)
          toast(`Barcode scanned: ${decodedText}`, 'success')
          lookupBarcode(decodedText)
        }
      }

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        onDecode,
        () => {} // per-frame misses are noise
      )
    } catch (err) {
      camScannerRef.current = null
      setCamScanning(false)
      setCamDenied(true)
      toast('Could not open the camera. Allow camera access, or enter the barcode number manually.', 'error')
    }
  }

  // ---- Image upload -------------------------------------------------------
  async function handleImageUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('image', file)
      const res = await api.post('/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      if (res.data?.url) {
        update('image_url', res.data.url)
        toast('Image uploaded', 'success')
      } else {
        toast('Upload succeeded but no URL was returned', 'error')
      }
    } catch (err) {
      toast(getErrorMessage(err, 'Image upload failed'), 'error')
    } finally {
      setUploading(false)
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  // ---- AI scan ------------------------------------------------------------
  async function handleScanFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setScanPreview(URL.createObjectURL(file))
    setScanning(true)
    try {
      const fd = new FormData()
      fd.append('image', file)
      const res = await api.post('/scan/ai', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const d = res.data || {}
      setForm((f) => ({
        ...f,
        name: d.name || f.name,
        category: d.category || f.category,
        description: d.description || f.description,
      }))
      toast('Details filled from photo — review below and set price', 'success')
    } catch (err) {
      toast(getErrorMessage(err, 'AI scan failed'), 'error')
    } finally {
      setScanning(false)
      if (scanInputRef.current) scanInputRef.current.value = ''
    }
  }

  // ---- Submit (single product, navigate /products) ------------------------
  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return toast('Product name is required', 'error')
    if (form.price === '' || Number.isNaN(Number(form.price)) || Number(form.price) < 0) {
      return toast('Enter a valid price', 'error')
    }
    if (form.stock !== '' && (Number.isNaN(Number(form.stock)) || Number(form.stock) < 0)) {
      return toast('Enter a valid stock quantity', 'error')
    }
    if (form.cost_price !== '' && (Number.isNaN(Number(form.cost_price)) || Number(form.cost_price) < 0)) {
      return toast('Enter a valid cost price', 'error')
    }

    setSaving(true)
    const payload = {
      name: form.name.trim(),
      category: form.category.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      stock: form.stock === '' ? 0 : Number(form.stock),
      cost_price: form.cost_price === '' ? null : Number(form.cost_price),
      image_url: form.image_url || null,
      ...(shopId ? { shop_id: shopId } : {}),
    }
    try {
      if (isEdit) {
        await api.put(`/products/${id}`, payload)
        toast('Product updated', 'success')
      } else {
        const res = await api.post('/products', payload)
        const savedId = res.data?.id || res.data?.product?.id
        if (code && savedId) addedMapRef.current[code] = savedId
        lastUsedPriceRef.current = payload.price
        setSessionCount((n) => n + 1)
        toast('Product added', 'success')
      }
      navigate('/products')
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  // ---- Submit and scan next (§4.2) ----------------------------------------
  async function handleSaveAndScanNext(e) {
    e.preventDefault()
    if (!form.name.trim()) return toast('Product name is required', 'error')
    if (form.price === '' || Number.isNaN(Number(form.price)) || Number(form.price) < 0) {
      return toast('Enter a valid price', 'error')
    }

    setSaving(true)
    const payload = {
      name: form.name.trim(),
      category: form.category.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      stock: form.stock === '' ? 0 : Number(form.stock),
      cost_price: form.cost_price === '' ? null : Number(form.cost_price),
      image_url: form.image_url || null,
      ...(shopId ? { shop_id: shopId } : {}),
    }
    try {
      const res = await api.post('/products', payload)
      const savedId = res.data?.id || res.data?.product?.id
      if (code && savedId) addedMapRef.current[code] = savedId
      lastUsedPriceRef.current = payload.price
      setSessionCount((n) => n + 1)
      toast('Saved. Scan the next item.', 'success')
      // Reset form but keep session state
      setForm({ name: '', category: '', description: '', price: '', stock: '', cost_price: '', image_url: '' })
      setReviewStrip(null)
      setCode('')
      setPriceFieldFlash(false)
      setTab('barcode')
      // Restart camera after 300ms so the tab paints
      setTimeout(() => {
        if (!camScanning) startCameraScan()
      }, 300)
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  // ---- Batch review sheet handlers ----------------------------------------
  function handleUpdateBatchRow(i, newRow) {
    setBatchRows((prev) => prev.map((r, idx) => idx === i ? newRow : r))
  }

  async function handleBatchDone() {
    setShowReviewSheet(false)
    toast(`Batch complete — ${sessionCount} products added.`, 'success')
    navigate('/products')
  }

  // ---- Finish & review batch ----------------------------------------------
  async function handleFinishBatch() {
    await stopCameraScan()
    setShowReviewSheet(true)
  }

  if (loading) return <Loading />

  const notFound_count = batchRows.filter((r) => r.status === 'not-found').length
  const batchTotal = sessionCount + notFound_count

  return (
    <div className={`page${kbOpen ? ' kb-open' : ''}`} onPointerDown={cancelPendingFocus}>
      <div className="page-head">
        <h1 className="page-title">{isEdit ? 'Edit product' : 'Add product'}</h1>
        <Link to="/products" className="btn btn-ghost btn-sm">
          Cancel
        </Link>
      </div>

      {/* Session counter chip (§4.3) — sticky, hidden at n=0 */}
      {sessionCount > 0 && (
        <div className="session-chip-host">
          <div className="session-chip">
            <Icon name="scan" size={16} style={{ color: 'var(--green)' }} />
            <span>
              <b>{sessionCount}</b> {sessionCount === 1 ? 'product' : 'products'} added this session
            </span>
          </div>
        </div>
      )}

      {!isEdit && (
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`tab ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              <Icon name={t.icon} size={16} /> {t.label}
            </button>
          ))}
        </div>
      )}

      {!isEdit && tab === 'ai' && (
        <div className="card scan-card">
          <p className="muted">
            Take a photo of the product — AI will fill the name, category and description for you.
          </p>
          <input
            ref={scanInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={handleScanFile}
          />
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => scanInputRef.current?.click()}
            disabled={scanning}
          >
            {scanning ? 'Scanning photo…' : (<><Icon name="camera" size={16} /> Take / upload photo</>)}
          </button>
          {scanPreview && (
            <div className="scan-preview">
              <img src={scanPreview} alt="Scanned product" />
              {scanning && (
                <div className="scan-overlay">
                  <div className="spinner light" />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!isEdit && tab === 'barcode' && (
        <div className="card scan-card">
          <p className="muted">Scan the barcode with your camera, or enter the number printed on the product packaging.</p>

          {/* Batch scan toggle (§4.4) */}
          <div className="batch-switch-row">
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Batch scan</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Camera stays on — each beep saves one item.</div>
            </div>
            <button
              type="button"
              className={`switch ${batchMode ? 'on' : ''}`}
              disabled={camDenied}
              style={{ opacity: camDenied ? 0.5 : 1 }}
              onClick={() => setBatchMode((v) => !v)}
              role="switch"
              aria-checked={batchMode}
              aria-label="Batch scan"
            >
              <span className="knob" />
            </button>
          </div>

          {/* Camera region */}
          {!camScanning ? (
            <button type="button" className="btn btn-primary" onClick={startCameraScan} disabled={camDenied}>
              <Icon name="camera" size={16} /> {camDenied ? 'Camera blocked' : 'Scan with camera'}
            </button>
          ) : (
            <div className="cam-wrap">
              {lookingUp && <div className="cam-progress" />}
              <div id={camRegionId} className="cam-region" />
              <button type="button" className="btn" onClick={stopCameraScan}>
                Cancel scan
              </button>
              {/* Finish & review button for batch */}
              {batchMode && (
                <button
                  type="button"
                  className="btn btn-scan-next btn-block"
                  disabled={sessionCount + batchRows.length === 0}
                  onClick={handleFinishBatch}
                >
                  Finish &amp; review ({batchTotal})
                </button>
              )}
            </div>
          )}

          {/* Manual barcode input — always functional */}
          <form onSubmit={handleBarcodeLookup} className="barcode-row">
            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. 8901234567890"
              aria-label="Barcode number"
            />
            <button type="submit" className="btn btn-primary" disabled={lookingUp}>
              {lookingUp ? 'Looking up…' : 'Lookup'}
            </button>
          </form>
        </div>
      )}

      <form className="card form-card" onSubmit={handleSubmit}>
        {!isEdit && tab !== 'manual' && !reviewStrip && (
          <p className="hint">Review the auto-filled details below, then set price &amp; stock.</p>
        )}

        <div className="field">
          <label htmlFor="p-name">Product name *</label>
          <input
            id="p-name"
            type="text"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="e.g. Tata Salt 1kg"
            required
          />
        </div>

        <div className="field">
          <label htmlFor="p-category">Category</label>
          <input
            id="p-category"
            type="text"
            value={form.category}
            onChange={(e) => update('category', e.target.value)}
            placeholder="e.g. Grocery, Snacks, Dairy"
          />
        </div>

        <div className="field">
          <label htmlFor="p-desc">Description</label>
          <textarea
            id="p-desc"
            rows="2"
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
            placeholder="Short description (optional)"
          />
        </div>

        {/* Review strip (§4.1) — directly above the Price field */}
        {reviewStrip && (
          <div className="review-strip">
            {reviewStrip.image_url ? (
              <img src={reviewStrip.image_url} alt={reviewStrip.name} className="review-strip__thumb" />
            ) : (
              <div className="review-strip__thumb">
                {(reviewStrip.name || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <span className="review-strip__name">{reviewStrip.name}</span>
            {reviewStrip.mrp != null ? (
              <span className="review-strip__mrp">MRP ₹{reviewStrip.mrp}</span>
            ) : (
              <span className="review-strip__mrp review-strip__mrp--warn">No MRP — enter your price</span>
            )}
          </div>
        )}

        {/* Price field with anchor and flash (§4.1) */}
        <div className="field-row">
          <div
            ref={priceAnchorRef}
            className={`field price-anchor${priceFieldFlash ? ' field-flash' : ''}`}
            onAnimationEnd={() => setPriceFieldFlash(false)}
          >
            <label htmlFor="p-price">Price (₹) *</label>
            <input
              ref={priceRef}
              id="p-price"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={form.price}
              onChange={(e) => update('price', e.target.value)}
              placeholder={reviewStrip && reviewStrip.mrp == null ? 'Enter price' : '0'}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="p-stock">Stock</label>
            <input
              id="p-stock"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={form.stock}
              onChange={(e) => update('stock', e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        {/* Cost price (optional) + live margin preview */}
        <div className="field">
          <label htmlFor="p-cost">{t('cost_price')}</label>
          <input
            id="p-cost"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={form.cost_price}
            onChange={(e) => update('cost_price', e.target.value)}
            placeholder="0"
          />
          <p className="hint">{t('cost_price_hint')}</p>
          {form.cost_price !== '' && form.price !== '' && Number(form.price) > 0 && (
            <p className="margin-preview">
              {t('margin')}: ₹{(Number(form.price) - Number(form.cost_price)).toFixed(2)} (
              {(((Number(form.price) - Number(form.cost_price)) / Number(form.price)) * 100).toFixed(1)}%)
            </p>
          )}
        </div>

        <div className="field">
          <label>Product image</label>
          {form.image_url && <img src={form.image_url} alt="Product" className="image-preview" />}
          <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={handleImageUpload} />
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => imageInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Uploading…' : form.image_url ? 'Replace image' : 'Upload image'}
          </button>
        </div>

        {/* Submit row (§4.2): Add product + Add & scan next */}
        {!isEdit ? (
          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Add product'}
            </button>
            <button
              type="button"
              className="btn btn-scan-next"
              disabled={saving}
              onClick={handleSaveAndScanNext}
            >
              Add &amp; scan next
            </button>
          </div>
        ) : (
          <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        )}
      </form>

      {/* Batch review sheet */}
      {showReviewSheet && (
        <ReviewSheet
          rows={batchRows}
          onUpdateRow={handleUpdateBatchRow}
          onFinish={handleBatchDone}
          onClose={() => setShowReviewSheet(false)}
        />
      )}
    </div>
  )
}
