import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { getErrorMessage } from '../api.js'
import { useToast } from '../components/Toast.jsx'
import Loading from '../components/Loading.jsx'
import Icon from '../components/Icon.jsx'

export default function Shop() {
  const toast = useToast()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [locating, setLocating] = useState(false)
  const [shopId, setShopId] = useState(null)
  const [form, setForm] = useState({ name: '', address: '', lat: '', lng: '', is_open: true })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.get('/shops?mine=true')
        const shops = Array.isArray(res.data) ? res.data : res.data?.shops || []
        const s = shops[0]
        if (s && !cancelled) {
          setShopId(s.id)
          setForm({
            name: s.name || '',
            address: s.address || '',
            lat: s.lat ?? '',
            lng: s.lng ?? '',
            is_open: s.is_open !== false,
          })
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
  }, [toast])

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
        setForm((f) => ({
          ...f,
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
        }))
        setLocating(false)
        toast('Location captured', 'success')
      },
      (err) => {
        setLocating(false)
        const msg =
          err?.code === 1
            ? 'Location permission denied. Allow location access or enter coordinates manually.'
            : err?.message || 'Could not get your location'
        toast(msg, 'error')
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
      return toast('Please set your shop location on the map', 'error')
    }

    setSaving(true)
    const payload = {
      name: form.name.trim(),
      address: form.address.trim(),
      lat,
      lng,
      is_open: !!form.is_open,
    }
    try {
      if (shopId) {
        await api.put(`/shops/${shopId}`, payload)
        toast('Shop updated', 'success')
      } else {
        await api.post('/shops', payload)
        toast('Shop created', 'success')
      }
      navigate('/')
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Loading />

  return (
    <div className="page">
      <h1 className="page-title">{shopId ? 'Manage shop' : 'Create your shop'}</h1>

      <form className="card form-card" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="shop-name">Shop name</label>
          <input
            id="shop-name"
            type="text"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="e.g. Sharma Kirana Store"
            required
          />
        </div>

        <div className="field">
          <label htmlFor="shop-address">Address</label>
          <textarea
            id="shop-address"
            rows="3"
            value={form.address}
            onChange={(e) => update('address', e.target.value)}
            placeholder="Shop no, street, area, city"
            required
          />
        </div>

        <div className="field">
          <label>GPS location</label>
          <button type="button" className="btn btn-outline" onClick={useMyLocation} disabled={locating}>
            {locating ? 'Detecting location…' : (<><Icon name="location" size={16} /> Use my current location</>)}
          </button>
          <div className="field-row">
            <input
              type="number"
              step="any"
              inputMode="decimal"
              value={form.lat}
              onChange={(e) => update('lat', e.target.value)}
              placeholder="Latitude"
              aria-label="Latitude"
            />
            <input
              type="number"
              step="any"
              inputMode="decimal"
              value={form.lng}
              onChange={(e) => update('lng', e.target.value)}
              placeholder="Longitude"
              aria-label="Longitude"
            />
          </div>
          <p className="hint">Customers discover your shop based on this location.</p>
        </div>

        <div className="switch-row">
          <span>Shop is open</span>
          <button
            type="button"
            className={`switch ${form.is_open ? 'on' : ''}`}
            onClick={() => update('is_open', !form.is_open)}
            role="switch"
            aria-checked={form.is_open}
            aria-label="Shop open"
          >
            <span className="knob" />
          </button>
        </div>

        <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
          {saving ? 'Saving…' : shopId ? 'Save changes' : 'Create shop'}
        </button>
      </form>
    </div>
  )
}
