import { useEffect, useState, useCallback } from 'react'
import api, { getErrorMessage } from '../api.js'
import { useToast } from '../components/Toast.jsx'
import Loading from '../components/Loading.jsx'
import Icon from '../components/Icon.jsx'

function getOrderTotal(o) {
  if (o.total != null && !isNaN(Number(o.total))) {
    return Number(o.total)
  }
  const items = Array.isArray(o.items) ? o.items : []
  return items.reduce((sum, it) => {
    const qty = Number(it.quantity ?? it.qty ?? 1) || 1
    return sum + (Number(it.price) || 0) * qty
  }, 0)
}

export default function Money() {
  const toast = useToast()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/orders')
      const list = Array.isArray(res.data) ? res.data : res.data?.orders || []
      setOrders(list)
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <Loading />

  const deliveredOrders = orders.filter((o) => (o.status || '').toLowerCase() === 'delivered')
  const pendingOrders = orders.filter((o) =>
    ['placed', 'accepted', 'packed'].includes((o.status || '').toLowerCase())
  )

  const earnings = deliveredOrders.reduce((sum, o) => sum + getOrderTotal(o), 0)
  const pending = pendingOrders.reduce((sum, o) => sum + getOrderTotal(o), 0)

  const placedCount = orders.filter((o) => (o.status || '').toLowerCase() === 'placed').length
  const acceptedCount = orders.filter((o) => (o.status || '').toLowerCase() === 'accepted').length
  const packedCount = orders.filter((o) => (o.status || '').toLowerCase() === 'packed').length
  const deliveredCount = deliveredOrders.length
  const pendingCount = pendingOrders.length

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Money</h1>
        <button type="button" className="btn btn-outline btn-sm" onClick={load}>
          Refresh
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="card empty-card">
          <p className="empty-icon"><Icon name="money" size={40} /></p>
          <p>No orders yet — your earnings will appear here.</p>
        </div>
      ) : (
        <>
          <div className="card">
            <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Earnings received</h3>
            <div className="money-hero">₹{earnings.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
            <p className="muted small" style={{ margin: '4px 0 0' }}>
              From {deliveredCount} delivered {deliveredCount === 1 ? 'order' : 'orders'}
            </p>
          </div>

          <div className="card">
            <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Pending from open orders</h3>
            <div className="money-hero">₹{pending.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
            <p className="muted small" style={{ margin: '4px 0 0' }}>
              From {pendingCount} open {pendingCount === 1 ? 'order' : 'orders'} ({placedCount} placed, {acceptedCount} accepted, {packedCount} packed)
            </p>
          </div>
        </>
      )}

      <div className="card">
        <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>UPI daily settlements — coming soon</h3>
        <p className="muted small" style={{ margin: 0 }}>
          Online payments are not live yet. This screen will show daily settlements to your UPI account once enabled.
        </p>
      </div>
    </div>
  )
}
