import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import api, { getErrorMessage } from '../api.js'
import { useToast } from '../components/Toast.jsx'
import Loading from '../components/Loading.jsx'

const TABS = [
  { key: 'ai', label: '📷 AI Scan' },
  { key: 'barcode', label: '🔳 Barcode' },
  { key: 'manual', label: '✍️ Manual' },
]

export default function ProductForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const toast = useToast()

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
    image_url: '',
  })

  // AI scan state
  const [scanning, setScanning] = useState(false)
  const [scanPreview, setScanPreview] = useState(null)
  const scanInputRef = useRef(null)

  // Barcode state
  const [code, setCode] = useState('')
  const [lookingUp, setLookingUp] = useState(false)

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

  async function handleBarcodeLookup(e) {
    e.preventDefault()
    if (!code.trim()) {
      toast('Enter a barcode number first', 'error')
      return
    }
    setLookingUp(true)
    try {
      const res = await api.post('/scan/barcode', { code: code.trim() })
      const d = res.data || {}
      if (d.found === false) {
        toast('No product found for this barcode — fill the details manually below.', 'info')
      } else {
        setForm((f) => ({
          ...f,
          name: d.name || f.name,
          description: d.brands ? `Brand: ${d.brands}` : f.description,
          image_url: d.image || f.image_url,
        }))
        toast('Details filled from barcode — review below', 'success')
      }
    } catch (err) {
      toast(getErrorMessage(err, 'Barcode lookup failed'), 'error')
    } finally {
      setLookingUp(false)
    }
  }

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

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return toast('Product name is required', 'error')
    if (form.price === '' || Number.isNaN(Number(form.price)) || Number(form.price) < 0) {
      return toast('Enter a valid price', 'error')
    }
    if (form.stock !== '' && (Number.isNaN(Number(form.stock)) || Number(form.stock) < 0)) {
      return toast('Enter a valid stock quantity', 'error')
    }

    setSaving(true)
    const payload = {
      name: form.name.trim(),
      category: form.category.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      stock: form.stock === '' ? 0 : Number(form.stock),
      image_url: form.image_url || null,
      ...(shopId ? { shop_id: shopId } : {}),
    }
    try {
      if (isEdit) {
        await api.put(`/products/${id}`, payload)
        toast('Product updated', 'success')
      } else {
        await api.post('/products', payload)
        toast('Product added', 'success')
      }
      navigate('/products')
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Loading />

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">{isEdit ? 'Edit product' : 'Add product'}</h1>
        <Link to="/products" className="btn btn-ghost btn-sm">
          Cancel
        </Link>
      </div>

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
              {t.label}
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
            {scanning ? 'Scanning photo…' : '📷 Take / upload photo'}
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
          <p className="muted">Enter the barcode number printed on the product packaging.</p>
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
              {lookingUp ? '…' : 'Lookup'}
            </button>
          </form>
        </div>
      )}

      <form className="card form-card" onSubmit={handleSubmit}>
        {!isEdit && tab !== 'manual' && (
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

        <div className="field-row">
          <div className="field">
            <label htmlFor="p-price">Price (₹) *</label>
            <input
              id="p-price"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={form.price}
              onChange={(e) => update('price', e.target.value)}
              placeholder="0"
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

        <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add product'}
        </button>
      </form>
    </div>
  )
}
