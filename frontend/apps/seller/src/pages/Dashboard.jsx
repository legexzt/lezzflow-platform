import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import api, { getErrorMessage } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import { useToast } from '../components/Toast.jsx'
import Loading from '../components/Loading.jsx'
import Icon from '../components/Icon.jsx'
import ChecklistCard from '../components/ChecklistCard.jsx'
import LowStockCard from '../components/LowStockCard.jsx'
import SlowMoversCard from '../components/SlowMoversCard.jsx'

function toList(data, key) {
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data[key])) return data[key]
  return []
}

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth()
  const toast = useToast()
  const [shop, setShop] = useState(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [counts, setCounts] = useState({ products: 0, orders: 0 })
  // checklistRef lets the not-live "Finish setup" link scroll to the checklist card
  const checklistRef = null

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/shops?mine=true')
      const myShop = toList(res.data, 'shops')[0] || null
      setShop(myShop)
      if (myShop) {
        const [p, o] = await Promise.allSettled([
          api.get('/products', { params: { shop_id: myShop.id } }),
          api.get('/orders'),
        ])
        setCounts({
          products: p.status === 'fulfilled' ? toList(p.value.data, 'products').length : 0,
          orders: o.status === 'fulfilled' ? toList(o.value.data, 'orders').length : 0,
        })
      }
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    // Wait until Firebase auth has settled before hitting the API — otherwise
    // the request goes out with no ID token (401) and flashes a bogus error
    // toast right after login.
    if (authLoading) return
    load()
  }, [load, authLoading])

  async function toggleOpen() {
    if (!shop || toggling) return
    setToggling(true)
    const nextOpen = !shop.is_open
    try {
      await api.put(`/shops/${shop.id}`, {
        name: shop.name,
        address: shop.address,
        lat: shop.lat,
        lng: shop.lng,
        is_open: nextOpen,
      })
      setShop((s) => ({ ...s, is_open: nextOpen }))
      toast(nextOpen ? 'Shop is now Open — customers can order' : 'Shop is now Closed', 'success')
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setToggling(false)
    }
  }

  if (loading) return <Loading />

  if (!shop) {
    const firstName = (user?.name || user?.displayName || '').split(' ')[0]
    return (
      <div className="page">
        <div className="card hero-card">
          <h1>Namaste{firstName ? `, ${firstName}` : ''}</h1>
          <p className="muted">
            Set up your shop to start selling to customers in your neighbourhood.
          </p>
          <Link to="/shop" className="btn btn-primary btn-block">
            Create your shop
          </Link>
        </div>
      </div>
    )
  }

  // §2.3: show info line only when switch is ON but shop is not live
  const showNotLiveLine = shop.is_open && !shop.isLive && !shop.is_live

  return (
    <div className="page">
      <h1 className="page-title">Dashboard</h1>

      {/* Shop card */}
      <div className="card shop-card">
        <div className="shop-card-top">
          <div>
            <h2 className="shop-name">{shop.name}</h2>
            <p className="muted">{shop.address}</p>
          </div>
          <span className={`badge ${shop.is_open ? 'badge-green' : 'badge-grey'}`}>
            {shop.is_open ? 'Open' : 'Closed'}
          </span>
        </div>

        <div className="switch-row">
          <span>{shop.is_open ? 'Accepting orders' : 'Not accepting orders'}</span>
          <button
            type="button"
            className={`switch ${shop.is_open ? 'on' : ''}`}
            onClick={toggleOpen}
            disabled={toggling}
            role="switch"
            aria-checked={!!shop.is_open}
            aria-label="Toggle shop open"
          >
            <span className="knob" />
          </button>
        </div>

        <Link to="/shop" className="btn btn-outline btn-block">
          Edit shop details
        </Link>
      </div>

      {/* §2.3 not-live info line — only when Open but not yet live */}
      {showNotLiveLine && (
        <div className="not-live-info">
          <Icon name="info" size={14} />
          <span>
            Your shop is Open but not live yet — customers can&apos;t see you until you finish setup.{' '}
            <a
              href="#checklist"
              onClick={(e) => {
                e.preventDefault()
                document.getElementById('setup-checklist')?.scrollIntoView({ behavior: 'smooth' })
              }}
            >
              Finish setup
            </a>
          </span>
        </div>
      )}

      {/* Item 2: Setup checklist card — below shop card, above everything else */}
      <div id="setup-checklist">
        <ChecklistCard
          shop={shop}
          productCount={counts.products}
          onGoLive={() => setShop((s) => ({ ...s, isLive: true }))}
        />
      </div>

      {/* Stat grid */}
      <div className="stat-grid">
        <Link to="/products" className="card stat-card">
          <span className="stat-num">{counts.products}</span>
          <span className="muted">Products</span>
        </Link>
        <Link to="/orders" className="card stat-card">
          <span className="stat-num">{counts.orders}</span>
          <span className="muted">Orders</span>
        </Link>
      </div>

      {/* Quick actions */}
      <div className="quick-actions">
        <Link to="/products/new" className="btn btn-primary btn-block">
          + Add product
        </Link>
        <Link to="/orders" className="btn btn-outline btn-block">
          View orders
        </Link>
      </div>

      {/* Item 5: Low stock card — below quick-actions */}
      <LowStockCard shopId={shop.id} />

      {/* Item 5: Slow movers card — below low stock */}
      <SlowMoversCard shopId={shop.id} />
    </div>
  )
}
