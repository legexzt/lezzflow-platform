/**
 * LowStockCard — Item 5, Card A
 * Shows products where stock <= 5 AND in-stock. 0-left shown in red and
 * ranked first. Max 3 rows displayed; footer "View all products ->" when more.
 * Uses shared setProductStock helper (same lf_stock_* cache as Products.jsx).
 * Fetches and fails INDEPENDENTLY from SlowMoversCard.
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import api, { getErrorMessage } from '../api.js'
import { useToast } from './Toast.jsx'
import Icon from './Icon.jsx'
import { setProductStock, readPrevStock } from '../helpers/setProductStock.js'

function Thumb({ product }) {
  const img = product.image_url || product.image
  if (img) return <img src={img} alt={product.name} className="insight-thumb" loading="lazy" />
  return (
    <div className="insight-thumb-fallback">
      {(product.name || 'P').charAt(0).toUpperCase()}
    </div>
  )
}

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className="insight-skel skeleton">
          <div className="skel-thumb" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="skel-bar" style={{ width: '70%' }} />
            <div className="skel-bar" style={{ width: '40%' }} />
          </div>
        </div>
      ))}
    </>
  )
}

export default function LowStockCard({ shopId }) {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [rows, setRows] = useState([]) // qualifying products
  const [handledState, setHandledState] = useState({}) // {id: {isOut, prevQty}}
  const [busyId, setBusyId] = useState(null)
  // Capture prevQty at mark-out time for Restore (in-memory, persisted via helper)
  const prevQtyRef = useRef({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get('/products', { params: shopId ? { shop_id: shopId } : {} })
      const all = Array.isArray(res.data) ? res.data : res.data?.products || []
      // Low stock: in-stock (stock is not null/undefined) AND qty <= 5
      // Out-of-stock products (marked by seller) do NOT appear
      const qualifying = all
        .filter((p) => {
          const qty = p.stock
          if (qty === null || qty === undefined) return false
          const n = Number(qty)
          if (isNaN(n)) return false
          // Exactly: stock > 0 is "in stock" in the Products convention.
          // But qty=0 and NOT explicitly marked out also appears (it's in-stock but out of quantity).
          // The spec says: available (in-stock) AND qty <= 5. We treat any product that hasn't been
          // explicitly toggled out (stock could be 0) as "available" unless its in_stock field is false.
          if (p.in_stock === false) return false
          return n <= 5
        })
        .sort((a, b) => {
          const qa = Number(a.stock), qb = Number(b.stock)
          if (qa !== qb) return qa - qb // ascending: 0 first
          return (a.name || '').localeCompare(b.name || '')
        })
      setRows(qualifying)
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't load stock insights."))
    } finally {
      setLoading(false)
    }
  }, [shopId])

  useEffect(() => { load() }, [load])

  async function markOut(product) {
    if (busyId === product.id) return
    const qty = Number(product.stock) || 0
    prevQtyRef.current[product.id] = qty
    setBusyId(product.id)
    try {
      await setProductStock(product, false)
      setHandledState((s) => ({ ...s, [product.id]: { isOut: true, prevQty: qty } }))
      // badge decrement — handled rows stay rendered until next mount
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't update — try again."), 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function restore(product) {
    if (busyId === product.id) return
    const cached = readPrevStock(product.id) || prevQtyRef.current[product.id]
    if (!cached) {
      // No previous qty: disable Restore — do not invent
      toast('No previous quantity found — set it on the Products page.', 'info')
      return
    }
    setBusyId(product.id)
    try {
      await setProductStock(product, true)
      setHandledState((s) => {
        const next = { ...s }
        delete next[product.id]
        return next
      })
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't update — try again."), 'error')
    } finally {
      setBusyId(null)
    }
  }

  // Header count = un-handled rows
  const unhandledCount = rows.filter((p) => !handledState[p.id]).length
  const displayRows = rows.slice(0, 3)
  const totalCount = rows.length

  // Empty all-stocked state
  if (!loading && !error && rows.length === 0) {
    return (
      <div className="card insight-card">
        <div className="insight-head">
          <div className="insight-icon-box"><Icon name="warning" size={18} /></div>
          <span className="insight-head-title">Low stock</span>
        </div>
        <div className="insight-empty-line">
          <Icon name="check" size={16} style={{ color: 'var(--green)' }} />
          <span style={{ fontSize: 14 }}>All stocked up</span>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>Nothing is running low right now.</p>
      </div>
    )
  }

  return (
    <div className="card insight-card">
      <div className="insight-head">
        <div className="insight-icon-box"><Icon name="warning" size={18} /></div>
        <span className="insight-head-title">Low stock</span>
        {unhandledCount > 0 && (
          <span className="badge insight-head count">{unhandledCount}</span>
        )}
      </div>
      <p className="insight-sub">Running low (5 or fewer left). Mark items out to stop orders you can't fulfil.</p>

      {loading && <SkeletonRows />}
      {error && !loading && (
        <div style={{ padding: '8px 0' }}>
          <p style={{ fontSize: 14, color: 'var(--danger)', margin: '0 0 8px' }}>{error}</p>
          <button type="button" className="btn btn-outline btn-sm" onClick={load}>Retry</button>
        </div>
      )}

      {!loading && !error && (
        <div className="insight-rows">
          {displayRows.map((product) => {
            const handled = handledState[product.id]
            const qty = Number(product.stock)
            const isBusy = busyId === product.id
            const noPrev = handled?.isOut && !readPrevStock(product.id) && !prevQtyRef.current[product.id]

            return (
              <div key={product.id} className={`insight-row ${handled?.isOut ? 'is-done' : ''}`}>
                <Thumb product={product} />
                <div className="insight-main">
                  <div className="insight-name">{product.name}</div>
                  {handled?.isOut ? (
                    <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                      Out of stock · was {handled.prevQty}
                    </div>
                  ) : (
                    <div className={`insight-qty ${qty === 0 ? 'is-zero' : ''}`}>
                      {qty === 0 ? '0 left' : `${qty} left`}
                    </div>
                  )}
                </div>
                {handled?.isOut ? (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => restore(product)}
                    disabled={isBusy || noPrev}
                    title={noPrev ? 'No previous quantity — set on Products page' : undefined}
                  >
                    {isBusy ? 'Updating…' : 'Restore'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => markOut(product)}
                    disabled={isBusy}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {isBusy ? 'Updating…' : 'Mark out of stock'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!loading && !error && totalCount > 3 && (
        <div className="insight-foot">
          <span />
          <Link to="/products" style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600 }}>
            View all products
          </Link>
        </div>
      )}
    </div>
  )
}
