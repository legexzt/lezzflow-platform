import { useEffect, useState, useCallback } from 'react'
import api, { getErrorMessage } from '../api.js'
import { useToast } from '../components/Toast.jsx'
import Loading from '../components/Loading.jsx'
import Icon from '../components/Icon.jsx'
import BarcodeScanner from '../components/BarcodeScanner.jsx'

// Scan & Pack: pick an accepted order, scan product barcodes to pack it,
// watch the live checklist + running bill, then confirm the pack.
const STATUS_LABEL = { packed: 'Ready to Pack' }

function statusLabel(s) {
  return STATUS_LABEL[s] || s
}

function toDate(v) {
  if (!v) return null
  if (typeof v === 'string' || typeof v === 'number') return new Date(v)
  if (v._seconds != null) return new Date(v._seconds * 1000)
  if (typeof v.toDate === 'function') return v.toDate()
  return null
}

function itemProductId(it) {
  return it.product_id ?? it.productId ?? it.product?.id ?? it.id ?? null
}

function orderTotal(o) {
  if (o.total != null) return o.total
  const items = Array.isArray(o.items) ? o.items : []
  return items.reduce((sum, it) => sum + (Number(it.price) || 0) * (it.quantity ?? it.qty ?? 1), 0)
}

export default function ScanPack() {
  const toast = useToast()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [order, setOrder] = useState(null)
  const [checklist, setChecklist] = useState({})
  const [progress, setProgress] = useState(null)
  const [runningBill, setRunningBill] = useState(null)
  const [fullBill, setFullBill] = useState(null)
  const [pending, setPending] = useState(null)
  const [packed, setPacked] = useState(false)
  const [lastScan, setLastScan] = useState(null)
  const [billLoading, setBillLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/orders')
      const list = Array.isArray(res.data) ? res.data : res.data?.orders || []
      const accepted = list.filter((o) => o?.status === 'accepted')
      accepted.sort(
        (a, b) => (toDate(a.created_at)?.getTime() || 0) - (toDate(b.created_at)?.getTime() || 0)
      )
      setOrders(accepted)
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  function resetPackState() {
    setChecklist({})
    setProgress(null)
    setRunningBill(null)
    setFullBill(null)
    setPending(null)
    setPacked(false)
    setLastScan(null)
  }

  function selectOrder(o) {
    const items = Array.isArray(o.items) ? o.items : []
    const map = {}
    items.forEach((it, i) => {
      const pid = itemProductId(it) ?? `item-${i}`
      const qty = it.quantity ?? it.qty ?? 1
      if (map[pid]) {
        map[pid].ordered += qty
      } else {
        map[pid] = {
          name: it.name || it.product_name || 'Item',
          price: Number(it.price) || 0,
          ordered: qty,
          scanned: 0,
        }
      }
    })
    resetPackState()
    setChecklist(map)
    setOrder(o)
  }

  function backToOrders() {
    setOrder(null)
    resetPackState()
    load()
  }

  async function handleScan(barcode) {
    if (!order || packed || confirming) return
    setPending(null)
    try {
      const res = await api.post(`/orders/${order.id}/pack-scan`, { barcode })
      const d = res.data || {}
      const p = d.product || {}
      const pid = p.id ?? barcode
      setChecklist((prev) => ({
        ...prev,
        [pid]: {
          name: p.name || prev[pid]?.name || 'Item',
          price: p.price ?? prev[pid]?.price ?? 0,
          ordered: d.ordered_qty ?? prev[pid]?.ordered ?? 0,
          scanned: d.scanned_qty ?? prev[pid]?.scanned ?? 0,
        },
      }))
      if (d.progress) setProgress(d.progress)
      if (d.running_bill) setRunningBill(d.running_bill)
      setLastScan({
        ok: true,
        message: `${p.name || 'Item'}: ${d.scanned_qty ?? '?'} of ${d.ordered_qty ?? '?'} scanned${d.remaining === 0 ? ' — complete' : ''}`,
      })
    } catch (err) {
      // Plain-words API errors: out of stock, already fully scanned,
      // product not in this order, order not in accepted state, etc.
      const msg = getErrorMessage(err)
      setLastScan({ ok: false, message: msg })
      toast(msg, 'error')
    }
  }

  async function viewBill() {
    if (!order) return
    setBillLoading(true)
    try {
      const res = await api.get(`/orders/${order.id}/bill`)
      setFullBill(res.data || null)
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setBillLoading(false)
    }
  }

  async function confirmPack() {
    if (!order) return
    setConfirming(true)
    setPending(null)
    try {
      await api.post(`/orders/${order.id}/confirm-pack`)
      setPacked(true)
      setFullBill(null)
      toast('Order packed — Ready to Pack', 'success')
    } catch (err) {
      const data = err?.response?.data
      if (err?.response?.status === 400 && Array.isArray(data?.pending)) {
        setPending(data.pending)
        // Sync the checklist with the server's view of what is still missing.
        setChecklist((prev) => {
          const next = { ...prev }
          data.pending.forEach((p) => {
            const k = p.product_id
            if (k != null && next[k]) {
              next[k] = {
                ...next[k],
                ordered: p.ordered ?? next[k].ordered,
                scanned: p.scanned ?? next[k].scanned,
              }
            }
          })
          return next
        })
        toast('Some items are still unscanned — see the list below.', 'error')
      } else {
        toast(getErrorMessage(err), 'error')
      }
    } finally {
      setConfirming(false)
    }
  }

  if (loading) return <Loading />

  // ---- Order picker: accepted orders waiting to be packed ----
  if (!order) {
    return (
      <div className="page">
        <div className="page-head">
          <h1 className="page-title">Scan & Pack</h1>
          <button type="button" className="btn btn-outline btn-sm" onClick={load}>
            Refresh
          </button>
        </div>

        {orders.length === 0 ? (
          <div className="card empty-card">
            <p className="empty-icon"><Icon name="scan" size={40} /></p>
            <p>No orders waiting to be packed.</p>
            <p className="muted">Accepted orders will show up here for scanning.</p>
          </div>
        ) : (
          <ul className="order-list">
            {orders.map((o) => {
              const items = Array.isArray(o.items) ? o.items : []
              const created = toDate(o.created_at)
              return (
                <li key={o.id} className="card order-card">
                  <div className="order-top">
                    <div>
                      <p className="order-id">Order #{String(o.id).slice(-6).toUpperCase()}</p>
                      {created && <p className="muted small">{created.toLocaleString()}</p>}
                    </div>
                    <div className="order-badges">
                      <span className={`badge ${o.fulfillment === 'delivery' ? 'badge-blue' : 'badge-purple'}`}>
                        <Icon name={o.fulfillment === 'delivery' ? 'scooter' : 'runner'} size={14} />
                        {o.fulfillment === 'delivery' ? ' Delivery' : ' Pickup'}
                      </span>
                      <span className={`badge status-${o.status}`}>{statusLabel(o.status)}</span>
                    </div>
                  </div>
                  <div className="order-bottom">
                    <div className="order-total-row">
                      <span className="muted small">
                        {items.length} item{items.length === 1 ? '' : 's'}
                      </span>
                      <span className="order-total">Total: ₹{orderTotal(o)}</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-block"
                      onClick={() => selectOrder(o)}
                    >
                      <Icon name="scan" size={16} /> Scan items
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    )
  }

  // ---- Pack confirmation state ----
  if (packed) {
    return (
      <div className="page">
        <div className="card empty-card">
          <p className="empty-icon"><Icon name="check" size={40} /></p>
          <p>Order #{String(order.id).slice(-6).toUpperCase()} is packed.</p>
          <p>
            <span className="badge badge-green">
              <Icon name="check" size={14} /> Ready to Pack
            </span>
          </p>
          <p className="muted">Total: ₹{runningBill?.total ?? orderTotal(order)}</p>
          <button type="button" className="btn btn-primary btn-block" onClick={backToOrders}>
            Back to orders
          </button>
        </div>
      </div>
    )
  }

  // ---- Scanning view ----
  const entries = Object.entries(checklist)
  const localTotals = entries.reduce(
    (acc, [, it]) => ({
      ordered: acc.ordered + (it.ordered || 0),
      scanned: acc.scanned + Math.min(it.scanned || 0, it.ordered || 0),
    }),
    { ordered: 0, scanned: 0 }
  )
  const scannedTotal = progress?.scanned_total ?? localTotals.scanned
  const orderedTotal = progress?.ordered_total ?? localTotals.ordered
  const created = toDate(order.created_at)
  const billDate = fullBill ? toDate(fullBill.date) : null

  return (
    <div className="page">
      <div className="page-head">
        <button type="button" className="btn btn-ghost btn-sm" onClick={backToOrders}>
          Back
        </button>
        <h1 className="page-title">Scan & Pack</h1>
      </div>

      <div className="card">
        <div className="order-top">
          <div>
            <p className="order-id">Order #{String(order.id).slice(-6).toUpperCase()}</p>
            {created && <p className="muted small">{created.toLocaleString()}</p>}
          </div>
          <div className="order-badges">
            <span className={`badge status-${order.status}`}>{statusLabel(order.status)}</span>
          </div>
        </div>
        <p className="muted small">
          {scannedTotal} of {orderedTotal} items scanned
        </p>
      </div>

      <BarcodeScanner onDetected={handleScan} active={!packed && !fullBill} />

      {lastScan && (
        <p>
          <span className={`badge ${lastScan.ok ? 'badge-green' : 'badge-grey'}`}>
            <Icon name={lastScan.ok ? 'check' : 'warning'} size={14} /> {lastScan.message}
          </span>
        </p>
      )}

      {pending && pending.length > 0 && (
        <div className="card">
          <p className="order-id">
            <Icon name="warning" size={14} /> Still unscanned
          </p>
          <ul className="order-items">
            {pending.map((p, i) => (
              <li key={p.product_id ?? i}>
                <span>{p.name || 'Item'}</span>
                <span className="muted">
                  {p.scanned ?? 0}/{p.ordered ?? '?'} scanned
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <p className="order-id">Packing checklist</p>
        {entries.length === 0 ? (
          <p className="muted small">This order has no items to scan.</p>
        ) : (
          <ul className="order-items">
            {entries.map(([pid, it]) => {
              const complete = it.ordered > 0 && it.scanned >= it.ordered
              return (
                <li key={pid}>
                  <span>
                    {it.name} × {it.scanned}/{it.ordered}
                  </span>
                  {complete ? (
                    <span className="badge badge-green">
                      <Icon name="check" size={12} /> Done
                    </span>
                  ) : (
                    <span className="badge badge-grey">{it.ordered - it.scanned} left</span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {runningBill && Array.isArray(runningBill.lines) && runningBill.lines.length > 0 && (
        <div className="card">
          <p className="order-id">Running bill</p>
          <ul className="order-items">
            {runningBill.lines.map((l, i) => (
              <li key={l.product_id ?? i}>
                <span>
                  {l.name} × {l.qty}
                </span>
                <span className="muted">
                  ₹{l.unit_price} · ₹{l.line_total}
                </span>
              </li>
            ))}
          </ul>
          <div className="order-total-row">
            <span className="order-total">Total: ₹{runningBill.total}</span>
          </div>
        </div>
      )}

      <div className="order-actions">
        <button
          type="button"
          className="btn btn-outline"
          onClick={viewBill}
          disabled={billLoading}
        >
          {billLoading ? 'Loading…' : (<><Icon name="receipt" size={16} /> View Bill</>)}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={confirmPack}
          disabled={confirming}
        >
          {confirming ? 'Confirming…' : (<><Icon name="check" size={16} /> Confirm Pack</>)}
        </button>
      </div>

      {fullBill && (
        <div className="card">
          <div className="order-top">
            <div>
              <p className="order-id">{fullBill.shop?.name || 'Bill'}</p>
              {fullBill.shop?.address && <p className="muted small">{fullBill.shop.address}</p>}
              <p className="muted small">
                Order #{String(fullBill.order_id ?? order.id).slice(-6).toUpperCase()}
              </p>
              {billDate && <p className="muted small">{billDate.toLocaleString()}</p>}
            </div>
            <div className="order-badges">
              {fullBill.status && (
                <span className={`badge status-${fullBill.status}`}>{statusLabel(fullBill.status)}</span>
              )}
            </div>
          </div>
          <ul className="order-items">
            {(Array.isArray(fullBill.lines) ? fullBill.lines : []).map((l, i) => (
              <li key={i}>
                <span>
                  {l.name} × {l.qty_scanned}
                </span>
                <span className="muted">
                  ₹{l.unit_price} · ₹{l.line_total}
                </span>
              </li>
            ))}
          </ul>
          <div className="order-total-row">
            <span className="order-total">Total: ₹{fullBill.total}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFullBill(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
