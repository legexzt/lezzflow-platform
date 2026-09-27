import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import api, { getErrorMessage } from '../api.js'
import { useToast } from '../components/Toast.jsx'
import Loading from '../components/Loading.jsx'
import Icon from '../components/Icon.jsx'

export default function Products() {
  const toast = useToast()
  const [shop, setShop] = useState(null)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const shopRes = await api.get('/shops?mine=true')
      const shops = Array.isArray(shopRes.data) ? shopRes.data : shopRes.data?.shops || []
      const s = shops[0] || null
      setShop(s)
      if (s) {
        const res = await api.get('/products', { params: { shop_id: s.id } })
        setProducts(Array.isArray(res.data) ? res.data : res.data?.products || [])
      } else {
        setProducts([])
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

  async function handleDelete(p) {
    if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return
    setDeletingId(p.id)
    try {
      await api.delete(`/products/${p.id}`)
      setProducts((list) => list.filter((x) => x.id !== p.id))
      toast('Product deleted', 'success')
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) return <Loading />

  if (!shop) {
    return (
      <div className="page">
        <h1 className="page-title">Products</h1>
        <div className="card empty-card">
          <p>Create your shop first, then add products.</p>
          <Link to="/shop" className="btn btn-primary btn-block">
            Set up shop
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Products</h1>
        <Link to="/products/new" className="btn btn-primary btn-sm">
          + Add
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="card empty-card">
          <p className="empty-icon"><Icon name="box" size={40} /></p>
          <p>No products yet.</p>
          <p className="muted">
            Add your first product with the AI scanner, a barcode, or manual entry.
          </p>
          <Link to="/products/new" className="btn btn-primary btn-block">
            Add product
          </Link>
        </div>
      ) : (
        <ul className="product-list">
          {products.map((p) => (
            <li key={p.id} className="card product-card">
              <div className="product-thumb">
                {p.image_url || p.image ? (
                  <img src={p.image_url || p.image} alt={p.name} loading="lazy" />
                ) : (
                  <span className="thumb-icon"><Icon name="bag" size={28} /></span>
                )}
              </div>
              <div className="product-info">
                <p className="product-name">{p.name}</p>
                {p.category && <p className="muted small">{p.category}</p>}
                <p className="product-meta">
                  <span className="price">₹{p.price}</span>
                  {p.stock != null && <span className="muted small"> · Stock: {p.stock}</span>}
                </p>
              </div>
              <div className="product-actions">
                <Link to={`/products/${p.id}/edit`} className="btn btn-outline btn-sm">
                  Edit
                </Link>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDelete(p)}
                  disabled={deletingId === p.id}
                >
                  {deletingId === p.id ? '…' : 'Delete'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
