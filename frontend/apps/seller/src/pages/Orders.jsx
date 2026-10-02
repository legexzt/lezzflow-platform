import { useEffect, useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import api, { getErrorMessage } from '../api.js'
import { useToast } from '../components/Toast.jsx'
import { useLang } from '../LanguageContext.jsx'
import Loading from '../components/Loading.jsx'
import Icon from '../components/Icon.jsx'
import PackingSlip from '../components/PackingSlip.jsx'

// Seller status flow: placed → accepted → packed (orders can also be cancelled)
const NEXT_STATUS = { placed: 'accepted', accepted: 'packed' }
const NEXT_ACTION = { placed: 'Accept order', accepted: 'Mark packed' }
const FILTERS = ['all', 'placed', 'accepted', 'packed', 'cancelled']
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

export default function Orders() {
  const toast = useToast()
  const { t } = useLang()
  const [shop, setShop] = useState(null)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [busyId, setBusyId] = useState(null)
  const [slipOrder, setSlipOrder] = useState(null)
  const slipRef = useRef(null)

  // Print once the slip has rendered.
  useEffect(() => {
    if (slipOrder) {
      const id = setTimeout(() => window.print(), 150)
      return () => clearTimeout(id)
    }
  }, [slipOrder])

  // Clear the slip after printing so the screen returns to normal.
  useEffect(() => {
    const after = () => setSlipOrder(null)
    window.addEventListener('afterprint', after)
    return () => window.removeEventListener('afterprint', after)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const shopRes = await api.get('/shops?mine=true')
      const shops = Array.isArray(shopRes.data) ? shopRes.data : shopRes.data?.shops || []
      const s = shops[0] || null
      setShop(s)
      if (s) {
        const res = await api.get('/orders')
        const list = Array.isArray(res.data) ? res.data : res.data?.orders || []
        list.sort((a, b) => {
          const da = toDate(a.created_at)?.getTime() || 0
          const db = toDate(b.created_at)?.getTime() || 0
          return db - da
        })
        setOrders(list)
      } else {
        setOrders([])
      }
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  async function advance(order) {
    const next = NEXT_STATUS[order.status]
    if (!next) return
    setBusyId(order.id)
    try {
      await api.patch(`/orders/${order.id}/status`, { status: next })
      setOrders((list) => list.map((o) => (o.id === order.id ? { ...o, status: next } : o)))
      toast(next === 'accepted' ? 'Order accepted' : 'Order marked Ready to Pack', 'success')
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function cancel(order) {
    if (NEXT_STATUS[order.status] == null) return
    setBusyId(order.id)
    try {
      await api.patch(`/orders/${order.id}/status`, { status: 'cancelled' })
      setOrders((list) => list.map((o) => (o.id === order.id ? { ...o, status: 'cancelled' } : o)))
      toast('Order cancelled', 'success')
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <Loading />

  if (!shop) {
    return (
      <div className="page">
        <h1 className="page-title">Orders</h1>
        <div className="card empty-card">
          <p>Create your shop first to start receiving orders.</p>
          <Link to="/shop" className="btn btn-primary btn-block">
            Set up shop
          </Link>
        </div>
      </div>
    )
  }

  const visible = filter === 'all' ? orders : orders.filter((o) => o.status === filter)

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Orders</h1>
        <button type="button" className="btn btn-outline btn-sm" onClick={load}>
          Refresh
        </button>
      </div>

      <div className="chip-row">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={`chip ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : STATUS_LABEL[f] || f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="card empty-card">
          <p className="empty-icon"><Icon name="receipt" size={40} /></p>
          <p>{filter === 'all' ? 'No orders yet.' : `No ${statusLabel(filter).toLowerCase()} orders.`}</p>
          <p className="muted">New orders from customers will appear here.</p>
        </div>
      ) : (
        <ul className="order-list">
          {visible.map((o) => {
            const items = Array.isArray(o.items) ? o.items : []
            const total =
              o.total ??
              items.reduce((sum, it) => {
                const qty = it.quantity ?? it.qty ?? 1
                return sum + (Number(it.price) || 0) * qty
              }, 0)
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

                {items.length > 0 && (
                  <ul className="order-items">
                    {items.map((it, i) => (
                      <li key={i}>
                        <span>
                          {it.name || it.product_name || 'Item'} × {it.quantity ?? it.qty ?? 1}
                        </span>
                        {it.price != null && <span className="muted">₹{it.price}</span>}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="order-bottom">
                  <div className="order-total-row">
                    {total != null && <span className="order-total">Total: ₹{total}</span>}
                    <span className="badge badge-blue"><Icon name="card" size={14} /> Payment coming soon</span>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setSlipOrder(o)}
                    >
                      <Icon name="receipt" size={14} /> {t('print_slip')}
                    </button>
                  </div>
                  {NEXT_STATUS[o.status] ? (
                    <div className="order-actions">
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => cancel(o)}
                        disabled={busyId === o.id}
                      >
                        {busyId === o.id ? 'Updating…' : 'Cancel'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => advance(o)}
                        disabled={busyId === o.id}
                      >
                        {busyId === o.id ? 'Updating…' : NEXT_ACTION[o.status]}
                      </button>
                    </div>
                  ) : o.status === 'cancelled' ? (
                    <span className="badge badge-grey"><Icon name="close" size={14} /> Cancelled</span>
                  ) : (
                    <span className="badge badge-green"><Icon name="check" size={14} /> Ready to Pack</span>
                  )}
                </div>

                {o.status === 'packed' && o.fulfillment === 'pickup' && (
                  <p className="hint">Ready for customer pickup.</p>
                )}
                {o.status === 'packed' && o.fulfillment === 'delivery' && (
                  <p className="hint">Waiting for a delivery partner to pick this up.</p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Hidden on screen; only the slip prints. */}
      <div id="packing-slip-print" aria-hidden={!slipOrder}>
        {slipOrder && <PackingSlip order={slipOrder} shop={shop} ref={slipRef} />}
      </div>
    </div>
  )
}
