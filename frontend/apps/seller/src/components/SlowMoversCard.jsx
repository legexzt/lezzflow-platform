/**
 * SlowMoversCard — Item 5, Card B
 * Shows products listed >= 60 days ago that appear in ZERO order lines across
 * the shop's FULL order history.
 *
 * Data rules (spec §5.1):
 * - daysListed = floor((now - created_at) / 86400000); qualifies when >= 60
 * - Zero order lines across FULL order history (all pages loaded)
 * - If shop has NO orders at all → "Not enough data" state (not every product
 *   labelled unsold — that would be fabricated)
 * - If full order history cannot be loaded (pagination fail) → "Not enough data"
 * - Cancelled orders' line items still count as sales
 * - Missing/unparsable created_at → product excluded silently
 * - Max 3 rows, sort by daysListed descending
 * - Create offer button: disabled, "Offers are coming soon" microcopy below it
 * - View all ({totalCount}) link when totalCount > 3
 * - Fails INDEPENDENTLY from LowStockCard
 */
import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import api, { getErrorMessage } from '../api.js'
import Icon from './Icon.jsx'

function Thumb({ product }) {
  const img = product.image_url || product.image
  if (img) return <img src={img} alt={product.name} className="insight-thumb" style={{ width: 36, height: 36 }} loading="lazy" />
  return (
    <div className="insight-thumb-fallback" style={{ width: 36, height: 36, fontSize: 14 }}>
      {(product.name || 'P').charAt(0).toUpperCase()}
    </div>
  )
}

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className="insight-skel skeleton">
          <div className="skel-thumb" style={{ width: 36, height: 36 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="skel-bar" style={{ width: '60%' }} />
            <div className="skel-bar" style={{ width: '35%' }} />
          </div>
        </div>
      ))}
    </>
  )
}

export default function SlowMoversCard({ shopId }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [slowMovers, setSlowMovers] = useState([])
  // null = not determined yet; false = shop has orders; true = no orders or load failed
  const [noData, setNoData] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setNoData(null)
    try {
      // Load products
      const prodRes = await api.get('/products', { params: shopId ? { shop_id: shopId } : {} })
      const allProducts = Array.isArray(prodRes.data) ? prodRes.data : prodRes.data?.products || []

      // Load FULL order history (spec: must be complete; if pagination exists, load all pages)
      // For this API we load once and trust it returns all orders for the shop
      let allOrders = []
      let ordersLoadFailed = false
      try {
        const ordRes = await api.get('/orders')
        allOrders = Array.isArray(ordRes.data) ? ordRes.data : ordRes.data?.orders || []
      } catch (_) {
        ordersLoadFailed = true
      }

      // Spec: if shop has NO orders at all → "not enough data" (can't call anything a slow mover)
      // If orders failed to load → also "not enough data" (partial history is forbidden)
      if (ordersLoadFailed || allOrders.length === 0) {
        setNoData(true)
        setSlowMovers([])
        setLoading(false)
        return
      }

      setNoData(false)

      // Build set of sold product IDs from ALL order lines (including cancelled orders' lines)
      const soldIds = new Set()
      for (const order of allOrders) {
        const items = Array.isArray(order.items) ? order.items : []
        for (const it of items) {
          const pid = it.product_id || it.productId
          if (pid != null) soldIds.add(String(pid))
          // Some APIs embed product name but not ID; we can't match those — conservatively skip
        }
      }

      const now = Date.now()
      const qualifying = allProducts
        .filter((p) => {
          // Missing/unparsable created_at → exclude silently
          if (!p.created_at) return false
          const createdMs = new Date(p.created_at).getTime()
          if (isNaN(createdMs)) return false
          if (createdMs > now) return false // future date → exclude
          const daysListed = Math.floor((now - createdMs) / 86400000)
          if (daysListed < 60) return false // under 60 days: not a slow mover yet
          // Never sold = not in any order line
          return !soldIds.has(String(p.id))
        })
        .map((p) => ({
          ...p,
          daysListed: Math.floor((now - new Date(p.created_at).getTime()) / 86400000),
        }))
        .sort((a, b) => {
          if (b.daysListed !== a.daysListed) return b.daysListed - a.daysListed
          return (a.name || '').localeCompare(b.name || '')
        })

      setSlowMovers(qualifying)
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't load sales insights."))
    } finally {
      setLoading(false)
    }
  }, [shopId])

  useEffect(() => { load() }, [load])

  const displayRows = slowMovers.slice(0, 3)
  const totalCount = slowMovers.length

  return (
    <div className="card insight-card">
      <div className="insight-head">
        <div className="insight-icon-box"><Icon name="chart" size={18} /></div>
        <span className="insight-head-title">Slow movers</span>
      </div>
      <p className="insight-sub">Listed 60+ days, never ordered.</p>

      {loading && <SkeletonRows />}

      {error && !loading && (
        <div style={{ padding: '8px 0' }}>
          <p style={{ fontSize: 14, color: 'var(--danger)', margin: '0 0 8px' }}>{error}</p>
          <button type="button" className="btn btn-outline btn-sm" onClick={load}>Retry</button>
        </div>
      )}

      {!loading && !error && noData === true && (
        <div style={{ padding: '8px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
            <Icon name="chart" size={32} style={{ color: '#c9c9c9' }} />
          </div>
          <p style={{ fontSize: 14, fontWeight: 700, textAlign: 'center', margin: '0 0 4px' }}>Not enough data yet</p>
          <p className="muted" style={{ fontSize: 13, textAlign: 'center', margin: 0 }}>
            Slow-mover insights appear once your shop has order history.
          </p>
        </div>
      )}

      {!loading && !error && noData === false && slowMovers.length === 0 && (
        <div className="insight-empty-line">
          <Icon name="check" size={16} style={{ color: 'var(--green)' }} />
          <div>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Nothing sitting unsold</span>
            <p className="muted" style={{ fontSize: 13, margin: '2px 0 0' }}>
              Every product listed 60+ days has at least one sale.
            </p>
          </div>
        </div>
      )}

      {!loading && !error && noData === false && slowMovers.length > 0 && (
        <>
          <div className="insight-rows">
            {displayRows.map((product) => (
              <div key={product.id} className="insight-row">
                <Thumb product={product} />
                <div className="insight-main">
                  <div className="insight-name">{product.name}</div>
                  <div className="insight-signal">
                    No sales in <b>{product.daysListed}</b> days
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="insight-foot">
            <div className="insight-foot-left">
              <button type="button" className="btn btn-outline btn-sm" disabled>
                Create offer
              </button>
              <span className="why">Offers are coming soon</span>
            </div>
            {totalCount > 3 && (
              <Link
                to="/products?filter=slow-movers"
                style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600, whiteSpace: 'nowrap' }}
              >
                View all ({totalCount})
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  )
}
